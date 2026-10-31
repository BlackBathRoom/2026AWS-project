import { Router, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireBackendAuth } from '../middleware/mock-auth';
import { materialTraining, selectedMaterial } from '../integrations/material-access';
import { resolveTutorProvider } from '../integrations/tutor-provider-factory';
import { TextbookAiQuota } from '../repositories/textbook-ai-quota';
import { asAssignmentId, asRuleVersionId } from '../contracts/common';

export const materialRouter = Router();
materialRouter.use('/materials', requireBackendAuth);
const fail = (req: Request, res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ code, message, requestId: req.requestId, timestamp: new Date().toISOString() });
materialRouter.get('/materials/config', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!materialTraining(req.auth!)) { fail(req, res, 403, 'FORBIDDEN', '教材を閲覧できる所属がありません。'); return; }
  res.json({ tutorEnabled: process.env.TEXTBOOK_AI_ENABLED === 'true' });
});
const dayJst = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

materialRouter.get('/materials/:id/view', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!materialTraining(req.auth!)) { fail(req, res, 403, 'FORBIDDEN', 'この教材を閲覧できる所属がありません。'); return; }
  const selected = selectedMaterial(String(req.params.id));
  if (!selected) { fail(req, res, 404, 'NOT_FOUND', 'この章の教科書は未登録です。'); return; }
  const bucket = process.env.MATERIALS_BUCKET_NAME;
  if (!bucket) { fail(req, res, 503, 'MATERIALS_NOT_CONFIGURED', '教材の接続先が未設定です。'); return; }
  const s3 = new S3Client({ region: process.env.MATERIALS_REGION || 'us-east-1' });
  try {
    const documents = await Promise.all(selected.map(async filename => ({ filename,
      url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: 'materials/info2/' + filename,
        ResponseContentType: 'application/pdf', ResponseContentDisposition: 'inline' }), { expiresIn: 300 }) })));
    res.json({ documents, expiresAt: new Date(Date.now() + 300000).toISOString() });
  } catch { fail(req, res, 503, 'MATERIALS_UNAVAILABLE', '教材の閲覧URLを取得できませんでした。'); }
  finally { s3.destroy(); }
});

// Large PDFs must be loaded directly from the signed S3 URLs, not buffered through Lambda.
materialRouter.get('/materials/:id/pdf', (req, res) => {
  fail(req, res, 410, 'DIRECT_DOWNLOAD_REQUIRED', '教材を再読み込みしてください。PDFは短期閲覧URLから取得します。');
});

// This endpoint is explicitly textbook study, separate from assignment/assessment help.
// The browser cannot select its learning mode, identity, membership, or allowAnswer policy.
materialRouter.post('/materials/:id/questions', async (req, res) => {
  const auth = req.auth!;
  const trainingId = materialTraining(auth);
  if (!trainingId || !selectedMaterial(String(req.params.id))) { fail(req, res, 403, 'FORBIDDEN', 'この教材へ質問できる所属がありません。'); return; }
  if (process.env.TEXTBOOK_AI_ENABLED !== 'true' || !process.env.BACKEND_TABLE_NAME || !process.env.TUTOR_QUEUE_URL) {
    fail(req, res, 503, 'AI_NOT_CONFIGURED', '教材AIの接続を準備中です。'); return;
  }
  const question = req.body?.question;
  const action = req.body?.requestedAction;
  if (typeof question !== 'string' || !question.trim() || question.length > 2000 ||
      !['explanation', 'hint', 'example'].includes(action)) {
    fail(req, res, 422, 'VALIDATION_ERROR', '質問は2000文字以内で入力してください。'); return;
  }
  const jobId = `job-${randomUUID()}`;
  const date = dayJst();
  const quota = new TextbookAiQuota(process.env.BACKEND_TABLE_NAME);
  let reserved = false;
  try {
    await quota.reserve(auth.userId, auth.organizationId, jobId, date, Date.now());
    reserved = true;
    const provider = resolveTutorProvider();
    if (!provider) throw new Error('Provider unavailable');
    // Await persistence and SQS dispatch before reporting success to the browser.
    await provider.enqueue({ jobId, userId: auth.userId, question: question.trim(), requestedAction: action,
      context: { userId: auth.userId, organizationId: auth.organizationId, trainingId,
        assignmentId: asAssignmentId(`textbook-${String(req.params.id)}`), mode: 'learning', assistancePolicy: 'guided',
        ruleVersionId: asRuleVersionId('textbook-rule-v1'), purpose: 'learning', conceptIds: [],
        allowAnswer: false, policyVersion: 'textbook-policy-v1' } });
    res.status(202).json({ jobId, quotaDate: date, status: 'QUEUED', pollAfterMs: 1500 });
  } catch (error) {
    if (reserved) await quota.release(auth.userId, auth.organizationId, jobId, date).catch(() => undefined);
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') {
      fail(req, res, 429, 'RATE_LIMITED', '処理中の質問があるか、1日20回の上限に達しています。'); return;
    }
    fail(req, res, 503, 'AI_UNAVAILABLE', 'AIへ質問を送信できませんでした。');
  }
});

materialRouter.get('/materials/questions/:jobId', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const auth = req.auth!;
  const jobId = String(req.params.jobId);
  if (!materialTraining(auth)) { fail(req, res, 403, 'FORBIDDEN', '所属を確認できません。'); return; }
  if (!/^job-[a-zA-Z0-9-]{1,100}$/.test(jobId)) { fail(req, res, 404, 'NOT_FOUND', '質問が見つかりません。'); return; }
  try {
    const provider = resolveTutorProvider();
    if (!provider) { fail(req, res, 503, 'AI_NOT_CONFIGURED', 'AIの接続が未設定です。'); return; }
    const job = await provider.getJob(jobId, { userId: auth.userId, organizationId: auth.organizationId });
    if (job.status === 'UNAVAILABLE') { fail(req, res, 404, 'NOT_FOUND', '質問が見つかりません。'); return; }
    const date = req.query.quotaDate;
    if (['COMPLETED', 'FAILED'].includes(job.status) && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && process.env.BACKEND_TABLE_NAME) {
      await new TextbookAiQuota(process.env.BACKEND_TABLE_NAME).release(auth.userId, auth.organizationId, jobId, date);
    }
    res.json({ jobId, status: job.status, result: job.result });
  } catch { fail(req, res, 503, 'AI_UNAVAILABLE', 'AIの処理状況を取得できません。'); }
});
