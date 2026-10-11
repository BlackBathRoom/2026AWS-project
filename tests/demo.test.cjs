'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/index');
let server, base;
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
async function request(path, { method = 'GET', body, cookie = '', origin } = {}) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(origin ? { Origin: origin } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function login(userId) { return (await request('/api/demo/login', { method: 'POST', body: { userId } })).cookie; }
test('unauthenticated API and cross-origin mutation are rejected', async () => {
  assert.equal((await request('/api/task')).status, 401);
  assert.equal((await request('/api/demo/login', { method: 'POST', body: { userId: 'admin' }, origin: 'https://example.invalid' })).status, 403);
});
test('answers remain server-side and repeated answers do not increase score', async () => {
  const cookie = await login('teacher');
  const questions = await request('/api/questions', { cookie });
  assert.ok(questions.data.every(q => !('answer' in q) && !('explanation' in q)));
  const first = await request('/api/answers', { method: 'POST', cookie, body: { questionId: 'q1', version: 1, choice: 0 } });
  const repeated = await request('/api/answers', { method: 'POST', cookie, body: { questionId: 'q1', version: 1, choice: 1 } });
  assert.equal(first.data.correct, false); assert.equal(repeated.data.correct, false); assert.equal(repeated.data.repeated, true);
  assert.equal((await request('/api/progress', { cookie })).data.answered, 1);
  assert.equal((await request('/api/answers', { method: 'POST', cookie, body: { questionId: 'q2', version: 1, choice: 99 } })).status, 400);
});
test('submission versions, optimistic concurrency, review permission and weakest axis', async () => {
  const cookie = await login('teacher'); const reviewer = await login('reviewer');
  assert.equal((await request('/api/admin/settings', { cookie })).status, 403);
  const fields = { goal: '目標', practice: '実践', explanation: '<img src=x onerror=alert(1)>', diagnosis: '診断', lesson: '授業案', assistance: 'なし' };
  assert.equal((await request('/api/draft', { method: 'PUT', cookie, body: { ...fields, revision: 9 } })).status, 409);
  const draft = await request('/api/draft', { method: 'PUT', cookie, body: { ...fields, revision: 0 } });
  const submitted = await request('/api/submissions', { method: 'POST', cookie, body: { revision: draft.data.revision, requestId: 'submission-test-1' } });
  assert.equal(submitted.status, 200);
  const replay = await request('/api/submissions', { method: 'POST', cookie, body: { revision: draft.data.revision, requestId: 'submission-test-1' } });
  assert.equal(submitted.data.id, replay.data.id);
  const reviewBody = { submissionId: submitted.data.id, scores: { K: 3, P: 3, E: 3, D: 1, L: 3 }, comment: '診断観点を改善', decision: 'confirmed' };
  assert.equal((await request('/api/reviews', { method: 'POST', cookie, body: reviewBody })).status, 403);
  assert.equal((await request('/api/reviews', { method: 'POST', cookie: reviewer, body: reviewBody })).status, 200);
  assert.equal((await request('/api/progress', { cookie })).data.reached, false);
  assert.equal((await request('/api/reviews', { method: 'POST', cookie: reviewer, body: reviewBody })).status, 409);
  await request('/api/appeals', { method: 'POST', cookie, body: { reason: '再確認希望' } });
  assert.equal((await request('/api/progress', { cookie })).data.appealPending, true);
  const newDraft = await request('/api/draft', { method: 'PUT', cookie, body: { ...fields, diagnosis: '改善した診断', revision: draft.data.revision } });
  const second = await request('/api/submissions', { method: 'POST', cookie, body: { revision: newDraft.data.revision, requestId: 'submission-test-2' } });
  assert.equal(second.data.version, 2);
  assert.equal((await request('/api/progress', { cookie })).data.review, null);
  const task = (await request('/api/task', { cookie })).data;
  assert.equal(task.submissions[0].body.diagnosis, '診断');
  assert.equal(task.submissions[1].body.diagnosis, '改善した診断');
});
test('AI access rechecks role, job ownership, study mode, stop and withdrawn sources', async () => {
  const cookie = await login('teacher'), reviewer = await login('reviewer'), admin = await login('admin'), manager = await login('manager');
  const job = await request('/api/ai/jobs', { method: 'POST', cookie, body: { question: '相関と因果' } });
  assert.equal(job.status, 202);
  assert.equal((await request(`/api/ai/jobs/${job.data.jobId}`, { cookie: reviewer })).status, 404);
  const set = values => request('/api/admin/settings', { method: 'PUT', cookie: admin, body: { aiEnabled: true, dailyLimit: 20, studyMode: 'practice', reason: '試験', ...values } });
  await set({ studyMode: 'assessment' });
  assert.equal((await request('/api/ai/jobs', { method: 'POST', cookie, body: { question: '授業', mode: 'practice' } })).status, 403);
  assert.equal((await request(`/api/ai/jobs/${job.data.jobId}`, { cookie })).status, 403);
  await set({ aiEnabled: false });
  assert.equal((await request(`/api/ai/jobs/${job.data.jobId}`, { cookie })).status, 503);
  await set({});
  assert.equal((await request('/api/ai/jobs', { method: 'POST', cookie, body: { question: '授業', scenario: 'limit' } })).status, 429);
  await new Promise(resolve => setTimeout(resolve, 2400));
  assert.equal((await request(`/api/ai/jobs/${job.data.jobId}`, { cookie })).data.verdict, 'SUPPORTED');
  const withdrawal = await request('/api/admin/materials/m1/transition', { method: 'POST', cookie: manager, body: { version: 1, status: 'WITHDRAWN', reason: '撤回試験' } });
  assert.equal(withdrawal.status, 200);
  assert.equal((await request(`/api/ai/jobs/${job.data.jobId}`, { cookie })).data.verdict, 'INSUFFICIENT');
  assert.ok(!(await request('/api/materials', { cookie })).data.some(m => m.id === 'm1'));
});
test('logout revokes session and demo is disabled in production', async () => {
  const cookie = await login('teacher');
  await request('/api/logout', { method: 'POST', cookie, body: {} });
  assert.equal((await request('/api/me', { cookie })).status, 401);
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  const production = createApp().listen(0, '127.0.0.1');
  if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
  await new Promise(resolve => production.once('listening', resolve));
  try {
    const result = await fetch(`http://127.0.0.1:${production.address().port}/api/demo/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'admin' }) });
    assert.equal(result.status, 503);
  } finally { await new Promise(resolve => production.close(resolve)); }
});
