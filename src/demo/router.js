'use strict';
const express = require('express');
const { randomUUID } = require('node:crypto');
const seed = require('./data');
const fields = ['goal', 'practice', 'explanation', 'diagnosis', 'lesson', 'assistance'];
const fail = (res, status, code, message) => res.status(status).json({ code, message });

function createDemoRouter() {
  const r = express.Router();
  const sessions = new Map(), answers = new Map(), jobs = new Map(), idempotency = new Map();
  const submissions = [], reviews = [], appeals = [], audit = [], feedback = [];
  const materials = structuredClone(seed.materials);
  let draft = Object.fromEntries(fields.map(k => [k, '']));
  draft = { ...draft, revision: 0, attachment: null };
  const settings = { aiEnabled: true, dailyLimit: 20, studyMode: 'practice' };
  const usage = new Map();
  const now = () => new Date().toISOString();
  function log(action, user, reason) { audit.unshift({ action, actor: user.name, reason, at: now() }); }
  function role(req, res, allowed) {
    if (!allowed.includes(req.user.role)) { fail(res, 403, 'FORBIDDEN', 'この操作を利用する権限がありません。'); return false; }
    return true;
  }
  function textFields(body) {
    return Object.fromEntries(fields.map(k => [k, typeof body[k] === 'string' ? body[k].trim().slice(0, 5000) : '']));
  }
  r.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (!req.is('application/json')) return fail(res, 415, 'JSON_REQUIRED', 'JSON形式で送信してください。');
      const origin = req.get('origin');
      if (origin && origin !== `${req.protocol}://${req.get('host')}`) return fail(res, 403, 'ORIGIN', '異なるサイトからの操作は受け付けません。');
      if (req.get('sec-fetch-site') === 'cross-site') return fail(res, 403, 'ORIGIN', '異なるサイトからの操作は受け付けません。');
    }
    next();
  });
  r.post('/demo/login', (req, res) => {
    const user = seed.users.find(u => u.id === req.body.userId);
    if (!user) return fail(res, 400, 'INVALID_USER', 'デモ利用者を選択してください。');
    const old = /(?:^|; )demo_session=([^;]+)/.exec(req.get('cookie') || '')?.[1];
    if (old) sessions.delete(old);
    const token = randomUUID(); sessions.set(token, { user, expires: Date.now() + 60 * 60 * 1000 });
    res.cookie('demo_session', token, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 3600000 });
    res.json({ user });
  });
  r.use((req, res, next) => {
    const token = /(?:^|; )demo_session=([^;]+)/.exec(req.get('cookie') || '')?.[1];
    const session = sessions.get(token);
    if (!session || session.expires < Date.now()) { sessions.delete(token); return fail(res, 401, 'SESSION_EXPIRED', 'セッションが切れました。再度デモ入場してください。'); }
    req.user = session.user; req.token = token; next();
  });
  r.get('/me', (req, res) => res.json({ user: req.user, settings, demo: true }));
  r.post('/logout', (req, res) => { sessions.delete(req.token); res.clearCookie('demo_session', { path: '/' }); res.json({ ok: true }); });
  r.get('/materials', (_req, res) => res.json(materials.filter(m => m.status === 'PUBLISHED')));
  r.get('/questions', (req, res) => {
    if (!role(req, res, ['teacher'])) return;
    res.json(seed.questions.map(({ answer, explanation, ...q }) => q));
  });
  r.post('/answers', (req, res) => {
    if (!role(req, res, ['teacher'])) return;
    const q = seed.questions.find(q => q.id === req.body.questionId && q.version === req.body.version);
    if (!q || !Number.isInteger(req.body.choice) || req.body.choice < 0 || req.body.choice >= q.options.length) return fail(res, 400, 'INVALID_ANSWER', '問題と選択肢を確認してください。');
    const key = `${req.user.id}:${q.id}:${q.version}`;
    if (answers.has(key)) return res.json({ ...answers.get(key), repeated: true });
    const result = { questionId: q.id, choice: req.body.choice, correct: q.answer === req.body.choice, explanation: q.explanation, tag: q.tag, materialId: q.materialId, at: now() };
    answers.set(key, result); res.json(result);
  });
  const latestSubmission = () => submissions.at(-1);
  const currentReview = () => reviews.findLast(v => v.submissionId === latestSubmission()?.id);
  function progress() {
    const list = [...answers.values()]; const review = currentReview();
    return { total: seed.questions.length, answered: list.length, correct: list.filter(a => a.correct).length,
      score: list.length ? Math.round(list.filter(a => a.correct).length / list.length * 100) : null,
      evidenceCount: list.length, weaknesses: list.filter(a => !a.correct), axes: seed.axes.map(([id, name]) => ({ id, name, value: review?.scores[id] ?? null })),
      reached: !!review && review.decision === 'confirmed' && Object.values(review.scores).every(n => n >= 2),
      review: review || null, submissionCount: submissions.length, pending: !!latestSubmission() && !review,
      unit: 'データサイエンス（デモ1単元）', rubricVersion: 'demo-1', appealPending: appeals.some(a => a.status === 'pending') };
  }
  r.get('/progress', (req, res) => { if (role(req, res, ['teacher', 'reviewer'])) res.json(progress()); });
  r.get('/task', (req, res) => {
    if (!role(req, res, ['teacher', 'reviewer'])) return;
    res.json({ id: 'task-1', title: '相関と因果の違いを教える授業を設計する', unit: 'データサイエンス', rubricVersion: 'demo-1', mode: settings.studyMode, draft: req.user.role === 'teacher' ? draft : null, submissions, reviews, appeals });
  });
  r.put('/draft', (req, res) => {
    if (!role(req, res, ['teacher'])) return;
    if (req.body.revision !== draft.revision) return fail(res, 409, 'CONFLICT', '別画面で更新されています。内容を控えて再読み込みしてください。');
    draft = { ...draft, ...textFields(req.body), revision: draft.revision + 1, savedAt: now() };
    res.json(draft);
  });
  r.post('/attachments', (req, res) => {
    if (!role(req, res, ['teacher'])) return;
    if (req.body.revision !== draft.revision) return fail(res, 409, 'CONFLICT', '下書きが更新されています。再読み込みしてください。');
    const { name, content } = req.body;
    if (typeof name !== 'string' || !name.toLowerCase().endsWith('.txt') || typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 100000) return fail(res, 400, 'INVALID_FILE', 'デモ添付はUTF-8のtxtファイル・100KBまでです。');
    draft = { ...draft, attachment: { name: name.slice(0, 150), content, status: 'DEMO_TEXT_ONLY' }, revision: draft.revision + 1, savedAt: now() };
    res.json(draft);
  });
  r.post('/submissions', (req, res) => {
    if (!role(req, res, ['teacher'])) return;
    const key = req.body.requestId;
    if (typeof key !== 'string' || key.length > 100 || !key) return fail(res, 400, 'INVALID_KEY', '送信IDが必要です。');
    if (idempotency.has(key)) return res.json(idempotency.get(key));
    if (req.body.revision !== draft.revision) return fail(res, 409, 'CONFLICT', '下書きが更新されています。再読み込みしてください。');
    if (fields.some(k => !draft[k]?.trim())) return fail(res, 400, 'REQUIRED', '全項目とAI援助の申告を入力して下書き保存してください。');
    if (latestSubmission() && !currentReview()) return fail(res, 409, 'REVIEW_PENDING', '現在の提出はレビュー待ちです。');
    if (latestSubmission()?.draftRevision === draft.revision) return fail(res, 409, 'UNCHANGED', '改善内容を下書き保存してから再提出してください。');
    const submission = { id: randomUUID(), version: submissions.length + 1, userId: req.user.id, draftRevision: draft.revision, body: structuredClone(draft), at: now(), rubricVersion: 'demo-1' };
    submissions.push(submission); idempotency.set(key, submission); res.json(submission);
  });
  r.post('/reviews', (req, res) => {
    if (!role(req, res, ['reviewer'])) return;
    const s = submissions.find(s => s.id === req.body.submissionId);
    if (!s || s.id !== latestSubmission()?.id) return fail(res, 409, 'OLD_VERSION', '最新の提出版を選んでください。');
    if (s.userId === req.user.id) return fail(res, 403, 'SELF_REVIEW', '自分の提出物を確定評価できません。');
    if (currentReview()) return fail(res, 409, 'ALREADY_REVIEWED', 'この提出版は評価済みです。');
    if (!['confirmed', 'revise'].includes(req.body.decision) || typeof req.body.comment !== 'string' || !req.body.comment.trim()) return fail(res, 400, 'REQUIRED', '評価結果と根拠・改善点を入力してください。');
    const scores = req.body.scores || {};
    if (seed.axes.some(([k]) => !Number.isInteger(scores[k]) || scores[k] < 0 || scores[k] > 3)) return fail(res, 400, 'SCORES', '5つの観点を0〜3で評価してください。');
    const cleanScores = Object.fromEntries(seed.axes.map(([k]) => [k, scores[k]]));
    const review = { id: randomUUID(), submissionId: s.id, version: s.version, scores: cleanScores, decision: req.body.decision, comment: req.body.comment.trim().slice(0, 5000), reviewer: req.user.name, at: now(), rubricVersion: 'demo-1' };
    reviews.push(review); res.json(review);
  });
  r.post('/appeals', (req, res) => {
    if (!role(req, res, ['teacher'])) return;
    const review = currentReview();
    if (!review || typeof req.body.reason !== 'string' || !req.body.reason.trim()) return fail(res, 400, 'REQUIRED', '確定された評価と申立て理由が必要です。');
    if (appeals.some(a => a.reviewId === review.id)) return fail(res, 409, 'DUPLICATE', 'この評価には申立て済みです。');
    const appeal = { reviewId: review.id, reason: req.body.reason.trim().slice(0, 2000), status: 'pending', at: now() }; appeals.push(appeal); res.json(appeal);
  });
  r.post('/ai/jobs', (req, res) => {
    if (!role(req, res, ['teacher', 'reviewer'])) return;
    if (!settings.aiEnabled) return fail(res, 503, 'AI_STOPPED', 'AIは停止中です。教材閲覧と小テストは利用できます。');
    if (settings.studyMode === 'assessment') return fail(res, 403, 'ASSESSMENT_RESTRICTED', '自力評価中はAIの援助を利用できません。');
    if (typeof req.body.question !== 'string' || !req.body.question.trim() || req.body.question.length > 2000) return fail(res, 400, 'QUESTION', '質問を1〜2000文字で入力してください。');
    const usageKey = `${req.user.id}:${now().slice(0, 10)}`;
    if ((usage.get(usageKey) || 0) >= settings.dailyLimit || req.body.scenario === 'limit') return fail(res, 429, 'LIMIT', '本日のAI利用上限に達しました。');
    usage.set(usageKey, (usage.get(usageKey) || 0) + 1);
    const job = { id: randomUUID(), userId: req.user.id, ready: Date.now() + 2300, question: req.body.question, scenario: req.body.scenario || 'normal', result: null };
    jobs.set(job.id, job); res.status(202).json({ jobId: job.id });
  });
  r.get('/ai/jobs/:id', (req, res) => {
    const j = jobs.get(req.params.id);
    if (!j || j.userId !== req.user.id) return fail(res, 404, 'NOT_FOUND', 'ジョブが見つかりません。');
    if (!settings.aiEnabled) return fail(res, 503, 'AI_STOPPED', 'AIは停止中です。');
    if (settings.studyMode === 'assessment') return fail(res, 403, 'ASSESSMENT_RESTRICTED', '自力評価中は回答を取得できません。');
    if (j.scenario === 'timeout' || Date.now() < j.ready) return res.json({ status: 'RUNNING' });
    if (j.scenario === 'failure') return res.json({ status: 'FAILED', message: '処理が失敗しました。質問内容は入力欄に残っています。' });
    const material = materials.find(m => m.id === 'm1' && m.status === 'PUBLISHED');
    if (!material || j.scenario === 'insufficient') return res.json({ status: 'COMPLETED', verdict: 'INSUFFICIENT', text: '公開中の教材に十分な根拠がありません。教材や評価者に確認してください。', citations: [] });
    if (j.scenario === 'outside' || !/相関|因果|散布|授業|データ/.test(j.question)) return res.json({ status: 'COMPLETED', verdict: 'OUT_OF_SCOPE', text: 'デモ教材の範囲外です。「相関と因果の違い」について質問してみてください。', citations: [] });
    j.result = { status: 'COMPLETED', verdict: 'SUPPORTED', text: '【固定文によるデモ回答】\n相関は2つの変数が共に変化する傾向です。相関があっても因果関係があるとは限りません。\n授業では、アイスの売上と熱中症の件数に共通して影響する「気温」を考える例が使えます。\nこの回答は画面確認用の参考例で、AIによる生成・検査や最終評価は行っていません。', citations: [{ materialId: material.id, title: material.title, chapter: material.chapter, page: material.page, version: material.version, source: material.source }] };
    res.json(j.result);
  });
  r.post('/ai/feedback', (req, res) => {
    const job = jobs.get(req.body.jobId);
    if (!job || job.userId !== req.user.id || !job.result) return fail(res, 404, 'NOT_FOUND', '回答が見つかりません。');
    if (typeof req.body.reason !== 'string' || !req.body.reason.trim()) return fail(res, 400, 'REQUIRED', '報告理由を入力してください。');
    feedback.push({ jobId: job.id, reason: req.body.reason.slice(0, 2000), at: now() }); res.json({ ok: true });
  });
  r.get('/training', (req, res) => { if (role(req, res, ['reviewer'])) res.json({ training: req.user.training, people: [{ name: seed.users[0].name, ...progress() }] }); });
  r.get('/admin/materials', (req, res) => { if (role(req, res, ['manager'])) res.json(materials); });
  r.post('/admin/materials', (req, res) => {
    if (!role(req, res, ['manager'])) return;
    const { title, text, source } = req.body;
    if (![title, text, source].every(v => typeof v === 'string' && v.trim() && v.length <= 5000)) return fail(res, 400, 'REQUIRED', '教材名・本文・出典を入力してください（各5000文字以内）。');
    const m = { id: randomUUID(), title: title.trim(), text: text.trim(), source: source.trim(), subject: '情報Ⅱ', unit: 'デモ追加教材', chapter: 'デモ追加章', page: '1', version: 1, status: 'DRAFT', related: '公開前に内容と利用許諾を確認してください。' };
    materials.push(m); res.json(m);
  });
  r.post('/admin/materials/:id/transition', (req, res) => {
    if (!role(req, res, ['manager'])) return;
    const m = materials.find(m => m.id === req.params.id);
    if (!m) return fail(res, 404, 'NOT_FOUND', '教材がありません。');
    if (m.version !== req.body.version) return fail(res, 409, 'CONFLICT', '教材が更新されました。再読み込みしてください。');
    const transitions = { DRAFT: ['REVIEW'], REVIEW: ['APPROVED'], APPROVED: ['INDEXING'], INDEXING: ['PUBLISHED'], PUBLISHED: ['WITHDRAWN'], WITHDRAWN: ['REVIEW'] };
    if (!transitions[m.status]?.includes(req.body.status)) return fail(res, 400, 'INVALID_STATE', 'この状態には変更できません。');
    if (typeof req.body.reason !== 'string' || !req.body.reason.trim()) return fail(res, 400, 'REQUIRED', '操作理由を入力してください。');
    m.status = req.body.status; m.version++; log(`教材：${m.title} → ${m.status}`, req.user, req.body.reason.slice(0, 1000)); res.json(m);
  });
  r.get('/admin/settings', (req, res) => { if (role(req, res, ['admin'])) res.json({ ...settings, audit, storage: 'デモサーバーのメモリのみ。再起動で削除。バックアップなし。' }); });
  r.put('/admin/settings', (req, res) => {
    if (!role(req, res, ['admin'])) return;
    if (typeof req.body.reason !== 'string' || !req.body.reason.trim()) return fail(res, 400, 'REQUIRED', '変更理由を入力してください。');
    if (typeof req.body.aiEnabled !== 'boolean' || !Number.isInteger(req.body.dailyLimit) || req.body.dailyLimit < 1 || req.body.dailyLimit > 100 || !['practice', 'assessment'].includes(req.body.studyMode)) return fail(res, 400, 'INVALID_SETTINGS', '設定値を確認してください。');
    Object.assign(settings, { aiEnabled: req.body.aiEnabled, dailyLimit: req.body.dailyLimit, studyMode: req.body.studyMode }); log('設定変更', req.user, req.body.reason.slice(0, 1000)); res.json(settings);
  });
  r.post('/admin/delete-learning', (req, res) => {
    if (!role(req, res, ['admin'])) return;
    if (req.body.confirm !== '削除' || typeof req.body.reason !== 'string' || !req.body.reason.trim()) return fail(res, 400, 'CONFIRM', '「削除」と理由を入力してください。');
    answers.clear(); jobs.clear(); idempotency.clear(); submissions.length = 0; reviews.length = 0; appeals.length = 0; feedback.length = 0;
    draft = { ...Object.fromEntries(fields.map(k => [k, ''])), revision: draft.revision + 1, attachment: null };
    log('デモ学習データ削除', req.user, req.body.reason.slice(0, 1000)); res.json({ ok: true });
  });
  r.use((_req, res) => fail(res, 404, 'NOT_FOUND', 'APIが見つかりません。'));
  return r;
}
module.exports = { createDemoRouter };
