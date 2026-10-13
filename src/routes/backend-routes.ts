import { Request, Response, Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthContext } from '../contracts/user';
import { requireBackendAuth } from '../middleware/mock-auth';
import { backendRepository as repo } from '../repositories/backend-repository';
import { DomainError, applyDeletion, assignReview, calculateAttainment, completeTutorJob, createSubmission, finalizeAssessment, getProgress, getRecommendations, getSafeQuestion, getUsage, nextQuestion, reapplyDeletionLedger, requireCurrentTraining, requireOrganization, requireRole, requireSelf, requireTraining, reserveAi, saveAttempt, submitSubmission, updateSubmission } from '../services/backend-services';

function errorResponse(req: Request, res: Response, error: unknown): void {
  if (error instanceof DomainError) { res.status(error.status).json({ code: error.code, message: error.message, requestId: req.requestId, timestamp: new Date().toISOString() }); return; }
  if (error instanceof z.ZodError) { res.status(422).json({ code: 'UNPROCESSABLE_ENTITY', message: '入力値が不正です', requestId: req.requestId, timestamp: new Date().toISOString() }); return; }
  res.status(500).json({ code: 'INTERNAL_ERROR', message: '内部エラーが発生しました', requestId: req.requestId, timestamp: new Date().toISOString() });
}
function endpoint(handler: (req: Request, res: Response) => void) { return (req: Request, res: Response) => { try { handler(req, res); } catch (error) { errorResponse(req, res, error); } }; }
const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const attemptInput = z.object({ attemptId: id, questionId: id, answer: z.array(z.string()).min(1), responseTimeMs: z.number().int().min(0), retryOf: id.optional() });
const profileInput = z.object({ experience: z.string().max(2000), targetUnits: z.array(z.string().max(128)).max(20), availableTimeMinutes: z.number().int().min(0).max(1440), selfAssessment: z.record(z.string(), z.number().int().min(0).max(3)) });
const submissionInput = z.object({ assignmentId: id, content: z.string().max(100000) });
const axisScores = z.object({ K: z.number().int().min(0).max(3), P: z.number().int().min(0).max(3), E: z.number().int().min(0).max(3), D: z.number().int().min(0).max(3), L: z.number().int().min(0).max(3) }).partial();
const reviewInput = z.object({ submissionVersionId: id, scores: axisScores, rationale: z.string().min(1).max(10000), evidenceRefs: z.array(z.string().max(256)).max(50) });

export const backendRouter = Router();
backendRouter.use(requireBackendAuth);

backendRouter.get('/quiz/next', endpoint((req, res) => {
  const auth = req.auth!; const lessonId = id.parse(req.query.lessonId); const retryOf = req.query.retry_of === undefined ? undefined : id.parse(req.query.retry_of); res.json(nextQuestion(repo, auth, lessonId, retryOf));
}));

backendRouter.post('/attempts', endpoint((req, res) => {
  const auth = req.auth!; const input = attemptInput.parse(req.body); const result = saveAttempt(repo, auth, { ...input, idempotencyKey: req.header('Idempotency-Key') || '' }); res.status(201).json(result);
}));

backendRouter.get('/progress', endpoint((req, res) => {
  const auth = req.auth!; const conceptId = req.query.concept_id === undefined ? undefined : id.parse(req.query.concept_id); res.json({ items: getProgress(repo, auth, conceptId) });
}));

backendRouter.get('/attainment', endpoint((req, res) => {
  const auth = req.auth!; const trainingId = id.parse(req.query.trainingId); requireCurrentTraining(repo, auth, trainingId); res.json(calculateAttainment(repo, auth, trainingId));
}));

backendRouter.get('/recommendations', endpoint((req, res) => { const auth = req.auth!; const trainingId = id.parse(req.query.trainingId); res.json(getRecommendations(repo, auth, trainingId)); }));

backendRouter.get('/training-assignments/:id', endpoint((req, res) => {
  const auth = req.auth!; const assignmentId = id.parse(req.params.id); const assignment = repo.getAssignment(assignmentId); if (!assignment) throw new DomainError(404, 'NOT_FOUND', '課題が見つかりません'); requireOrganization(auth, assignment.organizationId); requireCurrentTraining(repo, auth, assignment.trainingId); res.json(assignment);
}));

backendRouter.post('/submissions', endpoint((req, res) => {
  const auth = req.auth!; const input = submissionInput.parse(req.body); const idempotencyKey = req.header('Idempotency-Key'); if (!idempotencyKey) throw new DomainError(422, 'UNPROCESSABLE_ENTITY', 'Idempotency-Keyが必要です'); const cacheKey = `${auth.userId}:submission:${idempotencyKey}`; const fingerprint = JSON.stringify(input); const cached = repo.idempotency.get(cacheKey) as { fingerprint: string; response: unknown } | undefined; if (cached) { if (cached.fingerprint !== fingerprint) throw new DomainError(409, 'CONFLICT', '同じIdempotency-Keyに異なる内容を指定できません'); res.status(201).json(cached.response); return; } const result = createSubmission(repo, auth, input.assignmentId, input.content); repo.idempotency.set(cacheKey, { fingerprint, response: result }); res.status(201).json(result);
}));

backendRouter.get('/submissions/:id', endpoint((req, res) => {
  const auth = req.auth!; const submission = repo.submissions.find((item) => item.submissionId === req.params.id); if (!submission || submission.status === 'deleted') throw new DomainError(404, 'NOT_FOUND', '提出物が見つかりません'); requireOrganization(auth, submission.organizationId); if (auth.userId !== submission.ownerId && !['teacher', 'reviewer', 'admin'].includes(auth.role)) throw new DomainError(404, 'NOT_FOUND', '提出物が見つかりません'); res.json({ submission, versions: repo.submissionVersions.filter((item) => item.submissionId === submission.submissionId) });
}));

backendRouter.patch('/submissions/:id', endpoint((req, res) => {
  const auth = req.auth!; const input = z.object({ expectedVersion: z.number().int().positive(), content: z.string().max(100000) }).parse(req.body); res.json(updateSubmission(repo, auth, id.parse(req.params.id), input.expectedVersion, input.content));
}));

backendRouter.post('/submissions/:id/submit', endpoint((req, res) => {
  const auth = req.auth!; const input = z.object({ expectedVersion: z.number().int().positive(), content: z.string().max(100000).optional() }).parse(req.body); res.json(submitSubmission(repo, auth, id.parse(req.params.id), input.expectedVersion, input.content));
}));

backendRouter.post('/submissions/:id/files', endpoint((req, res) => {
  const auth = req.auth!; const submission = repo.submissions.find((item) => item.submissionId === req.params.id); if (!submission) throw new DomainError(404, 'NOT_FOUND', '提出物が見つかりません'); requireSelf(auth, submission.ownerId);
  const input = z.object({ filename: z.string().min(1).max(255), mimeType: z.string().min(1).max(128), size: z.number().int().positive(), checksum: z.string().min(1).max(256) }).parse(req.body);
  const allowed = ['text/plain', 'text/csv', 'text/x-python', 'application/x-ipynb+json']; const currentVersion = repo.submissionVersions.find((item) => item.submissionId === submission.submissionId && item.versionNumber === submission.currentVersion); if ((currentVersion?.fileIds.length || 0) >= 5) throw new DomainError(422, 'UNPROCESSABLE_ENTITY', '提出版あたりの添付数が上限を超えています'); if (input.size > 2 * 1024 * 1024) throw new DomainError(413, 'PAYLOAD_TOO_LARGE', 'ファイルサイズが上限を超えています'); if (!allowed.includes(input.mimeType) || /<|\.html?$/i.test(input.filename)) throw new DomainError(422, 'UNPROCESSABLE_ENTITY', '許可されていないファイル形式です');
  const file = { fileId: `file-${randomUUID()}` as import('../contracts/backend').FileId, organizationId: auth.organizationId, ownerId: auth.userId, submissionId: submission.submissionId, filename: input.filename, mimeType: input.mimeType, size: input.size, checksum: input.checksum, scanStatus: 'pending' as const, storageKey: `${auth.organizationId}/${submission.submissionId}/${randomUUID()}` }; repo.files.push(file); const version = repo.submissionVersions.find((item) => item.submissionId === submission.submissionId && item.versionNumber === submission.currentVersion); if (version) version.fileIds.push(file.fileId); res.status(201).json({ fileId: file.fileId, scanStatus: file.scanStatus, filename: file.filename, size: file.size });
}));

backendRouter.post('/files/:id/complete', endpoint((req, res) => {
  const auth = req.auth!; const file = repo.files.find((item) => item.fileId === req.params.id); if (!file) throw new DomainError(404, 'NOT_FOUND', 'ファイルが見つかりません'); requireSelf(auth, file.ownerId); file.scanStatus = req.body.scanStatus === 'clean' ? 'clean' : 'rejected'; res.json({ fileId: file.fileId, scanStatus: file.scanStatus });
}));

backendRouter.get('/files/:id', endpoint((req, res) => {
  const auth = req.auth!; const file = repo.files.find((item) => item.fileId === req.params.id); if (!file || file.scanStatus !== 'clean') throw new DomainError(404, 'NOT_FOUND', '利用可能なファイルが見つかりません'); requireOrganization(auth, file.organizationId); if (auth.userId !== file.ownerId && !['teacher', 'reviewer', 'admin'].includes(auth.role)) throw new DomainError(404, 'NOT_FOUND', 'ファイルが見つかりません'); res.json({ fileId: file.fileId, filename: file.filename, mimeType: file.mimeType, size: file.size, storageKey: file.storageKey });
}));

backendRouter.get('/reviews', endpoint((req, res) => {
  const auth = req.auth!; requireRole(auth, ['reviewer', 'teacher']); res.json({ items: repo.reviewAssignments.filter((item) => item.reviewerId === auth.userId && item.organizationId === auth.organizationId).map((item) => ({ ...item, assessment: repo.assessments.find((assessment) => assessment.submissionVersionId === item.submissionVersionId) })) });
}));

backendRouter.post('/reviews/assign', endpoint((req, res) => { const auth = req.auth!; const input = z.object({ submissionVersionId: id, reviewerId: id }).parse(req.body); res.status(201).json(assignReview(repo, auth, input.submissionVersionId, input.reviewerId)); }));

backendRouter.post('/reviews', endpoint((req, res) => {
  const auth = req.auth!; requireRole(auth, ['reviewer', 'teacher']); const input = reviewInput.parse(req.body); const version = repo.submissionVersions.find((item) => item.submissionVersionId === input.submissionVersionId); if (!version) throw new DomainError(404, 'NOT_FOUND', '提出版が見つかりません'); if (version.ownerId === auth.userId) throw new DomainError(403, 'FORBIDDEN', '自己レビューはできません'); const submission = repo.submissions.find((item) => item.submissionId === version.submissionId)!; requireOrganization(auth, submission.organizationId); if (!repo.reviewAssignments.some((item) => item.submissionVersionId === version.submissionVersionId && item.reviewerId === auth.userId && item.status === 'assigned')) throw new DomainError(403, 'FORBIDDEN', '割り当てられた評価者ではありません'); const assessment = { assessmentId: `assessment-${randomUUID()}`, submissionVersionId: version.submissionVersionId, rubricVersionId: 'rubric-v1' as import('../contracts/common').RubricVersionId, scores: input.scores, rationale: input.rationale, evidenceRefs: input.evidenceRefs, reviewerId: auth.userId, status: 'draft' as const, version: 1 }; repo.assessments.push(assessment); res.status(201).json(assessment);
}));

backendRouter.post('/reviews/:id/finalize', endpoint((req, res) => { const auth = req.auth!; const input = z.object({ expectedVersion: z.number().int().positive() }).parse(req.body); res.json(finalizeAssessment(repo, auth, id.parse(req.params.id), input.expectedVersion)); }));

backendRouter.post('/review-appeals', endpoint((req, res) => {
  const auth = req.auth!; const input = z.object({ assessmentId: id, reason: z.string().min(1).max(5000) }).parse(req.body); const assessment = repo.assessments.find((item) => item.assessmentId === input.assessmentId && item.status === 'final'); if (!assessment) throw new DomainError(404, 'NOT_FOUND', '確定評価が見つかりません'); const version = repo.submissionVersions.find((item) => item.submissionVersionId === assessment.submissionVersionId)!; requireSelf(auth, version.ownerId); const appeal = { appealId: `appeal-${crypto.randomUUID()}`, assessmentId: input.assessmentId, requesterId: auth.userId, reason: input.reason, status: 'open' as const }; repo.appeals.push(appeal); res.status(201).json(appeal);
}));

backendRouter.post('/review-appeals/:id/resolve', endpoint((req, res) => {
  const auth = req.auth!; requireRole(auth, ['reviewer', 'teacher']); const appeal = repo.appeals.find((item) => item.appealId === req.params.id && item.status === 'open'); if (!appeal) throw new DomainError(404, 'NOT_FOUND', '異議申立てが見つかりません'); const original = repo.assessments.find((item) => item.assessmentId === appeal.assessmentId)!; if (original.reviewerId === auth.userId) throw new DomainError(403, 'FORBIDDEN', '同じ評価者は再評価できません'); const input = z.object({ scores: axisScores, rationale: z.string().min(1) }).parse(req.body); const assessment = { ...original, assessmentId: `assessment-${randomUUID()}`, scores: input.scores, rationale: input.rationale, reviewerId: auth.userId, status: 'final' as const, version: 1 }; original.status = 'superseded'; repo.assessments.push(assessment); repo.reEvaluations.push({ reEvaluationId: `reevaluation-${randomUUID()}`, assessmentId: original.assessmentId, reviewerId: auth.userId, decision: 'accepted', createdAt: new Date().toISOString() }); appeal.status = 'resolved'; appeal.reassignedReviewerId = auth.userId; appeal.newAssessmentId = assessment.assessmentId; res.json({ appeal, assessment });
}));

backendRouter.get('/cohorts/:id/analytics', endpoint((req, res) => {
  const auth = req.auth!; requireRole(auth, ['teacher', 'reviewer']); const trainingId = id.parse(req.params.id); requireCurrentTraining(repo, auth, trainingId); const uniqueUsers = repo.users.filter((user) => user.organizationId === auth.organizationId && user.role === 'student' && user.status === 'active' && repo.memberships.some((membership) => membership.userId === user.userId && membership.status === 'active' && membership.trainingIds.includes(trainingId as import('../contracts/common').TrainingId))).map((user) => user.userId); const submissions = repo.submissions.filter((item) => item.trainingId === trainingId && uniqueUsers.includes(item.ownerId)); const submitted = submissions.filter((item) => item.status === 'submitted' || item.status === 'reviewed'); const reviewed = submissions.filter((item) => item.status === 'reviewed'); res.json({ trainingId, learnerCount: uniqueUsers.length, progress: uniqueUsers.map((userId) => ({ userId, knowledge: repo.progress.filter((item) => item.userId === userId), attainment: calculateAttainment(repo, { ...auth, userId } as AuthContext, trainingId) })), submittedCount: submitted.length, unsubmittedCount: Math.max(0, uniqueUsers.length - submissions.length), reviewWaitingCount: submitted.length - reviewed.length, notEvaluatedCount: Math.max(0, submitted.length - reviewed.length) });
}));

backendRouter.get('/me/training-profile', endpoint((req, res) => { const auth = req.auth!; const profile = repo.profiles.find((item) => item.userId === auth.userId); res.json(profile || { userId: auth.userId, organizationId: auth.organizationId, experience: '', targetUnits: [], availableTimeMinutes: 0, selfAssessment: {}, version: 0 }); }));
backendRouter.put('/me/training-profile', endpoint((req, res) => { const auth = req.auth!; const input = profileInput.parse(req.body); const expectedVersion = z.number().int().nonnegative().parse(req.body.expectedVersion); const existing = repo.profiles.find((item) => item.userId === auth.userId); if (existing && existing.version !== expectedVersion) throw new DomainError(409, 'CONFLICT', 'プロフィールの版が競合しています'); const profile = { userId: auth.userId, organizationId: auth.organizationId, ...input, version: (existing?.version || 0) + 1 }; repo.profileHistory.push(profile); if (existing) Object.assign(existing, profile); else repo.profiles.push(profile); res.json(profile); }));

backendRouter.post('/admin/deletion-requests', endpoint((req, res) => { const auth = req.auth!; requireRole(auth, ['admin']); const input = z.object({ subjectId: id, scope: z.enum(['all', 'learning', 'submissions']), reason: z.string().min(1).max(1000) }).parse(req.body); requireOrganization(auth, auth.organizationId); const record = { requestId: `deletion-${randomUUID()}` as import('../contracts/backend').DeletionRequestId, organizationId: auth.organizationId, subjectId: input.subjectId as import('../contracts/common').UserId, scope: input.scope, status: 'requested' as const, requestedAt: new Date().toISOString() }; repo.deletions.push(record); res.status(202).json(record); }));
backendRouter.post('/admin/deletion-requests/:id/apply', endpoint((req, res) => { const auth = req.auth!; res.json(applyDeletion(repo, auth, id.parse(req.params.id))); }));
backendRouter.post('/admin/deletion-requests/:id/reapply', endpoint((req, res) => { const auth = req.auth!; res.json(reapplyDeletionLedger(repo, auth, id.parse(req.params.id))); }));
backendRouter.get('/admin/usage', endpoint((req, res) => { const auth = req.auth!; res.json(getUsage(repo, auth)); }));
backendRouter.get('/admin/audits', endpoint((req, res) => { const auth = req.auth!; requireRole(auth, ['admin']); res.json({ items: repo.audits.filter((item) => item.organizationId === auth.organizationId) }); }));

backendRouter.post('/admin/policies', endpoint((req, res) => { const auth = req.auth!; requireRole(auth, ['admin']); const input = z.object({ expectedVersion: z.string().optional(), aiEnabled: z.boolean(), dailyAiLimit: z.number().int().positive().max(1000), concurrentJobLimit: z.number().int().positive().max(10), allowAnswer: z.boolean() }).parse(req.body); const existing = repo.getPolicy(auth.organizationId)!; if (input.expectedVersion && input.expectedVersion !== existing.version) throw new DomainError(409, 'CONFLICT', 'ポリシーの版が競合しています'); const policy = { ...existing, ...input, version: `policy-${Number(existing.version.replace('policy-v', '')) + 1}` as typeof existing.version, updatedAt: new Date().toISOString() }; Object.assign(existing, policy); res.json(policy); }));

backendRouter.post('/tutor/jobs', endpoint((req, res) => { const auth = req.auth!; const input = z.object({ question: z.string().min(1).max(2000), requestedAction: z.enum(['hint', 'explanation', 'example', 'answer']) }).parse(req.body); const context = repo.getStudyContext(auth.userId, auth.trainingIds[0], 'assignment-001'); const policy = repo.getPolicy(auth.organizationId); if (input.requestedAction === 'answer' && (context?.mode === 'assessment' || !policy?.allowAnswer)) throw new DomainError(403, 'FORBIDDEN', '現在の援助ポリシーでは正答を要求できません'); reserveAi(repo, auth); const job = { jobId: `job-${randomUUID()}`, userId: auth.userId, organizationId: auth.organizationId, status: 'QUEUED' as const }; repo.jobs.push(job); res.status(202).json({ jobId: job.jobId, status: job.status, pollAfterMs: 500 }); }));
backendRouter.get('/tutor/jobs/:id', endpoint((req, res) => { const auth = req.auth!; const job = repo.jobs.find((item) => item.jobId === req.params.id && item.userId === auth.userId && item.organizationId === auth.organizationId); if (!job) throw new DomainError(404, 'NOT_FOUND', 'AIジョブが見つかりません'); res.json({ jobId: job.jobId, status: job.status, result: job.result }); }));