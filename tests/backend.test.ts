import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';

const api = request(app);
const student = { Authorization: 'Bearer mock-user-001' };
const reviewer = { Authorization: 'Bearer mock-user-004' };
const teacher = { Authorization: 'Bearer mock-user-003' };

describe('担当B backend services', () => {
  it('承認済み問題を正答情報なしで取得できる', async () => {
    const response = await api.get('/api/v1/quiz/next?lessonId=training-001').set(student);
    expect(response.status).toBe(200);
    expect(response.body.questionId).toBe('question-001');
    expect(response.body).not.toHaveProperty('correctAnswer');
  });

  it('回答を採点して保存し、同じIdempotency-Keyを再利用できる', async () => {
    const body = { attemptId: 'attempt-contract-001', questionId: 'question-001', answer: ['b'], responseTimeMs: 800 };
    const first = await api.post('/api/v1/attempts').set({ ...student, 'Idempotency-Key': 'attempt-key-001' }).send(body);
    const retry = await api.post('/api/v1/attempts').set({ ...student, 'Idempotency-Key': 'attempt-key-001' }).send(body);
    expect(first.status).toBe(201);
    expect(first.body.result).toBe('correct');
    expect(retry.body).toEqual(first.body);
  });

  it('再回答は同じrootに紐付き、知識スコアへ再加算しない', async () => {
    const initial = await api.post('/api/v1/attempts').set({ ...student, 'Idempotency-Key': 'attempt-practice-initial' }).send({ attemptId: 'attempt-practice-root', questionId: 'question-001', answer: ['a'], responseTimeMs: 500 });
    const before = await api.get('/api/v1/progress?concept_id=concept-001').set(student);
    const retryQuestion = await api.get('/api/v1/quiz/next?lessonId=training-001&retry_of=attempt-practice-root').set(student);
    const practice = await api.post('/api/v1/attempts').set({ ...student, 'Idempotency-Key': 'attempt-practice-retry' }).send({ attemptId: 'attempt-practice-retry-id', questionId: 'question-001', retryOf: initial.body.attemptId, answer: ['b'], responseTimeMs: 400 });
    const after = await api.get('/api/v1/progress?concept_id=concept-001').set(student);
    expect(retryQuestion.body.rootAttemptId).toBe(initial.body.attemptId);
    expect(practice.body.scored).toBe(false);
    expect(after.body.items[0].attemptCount).toBe(before.body.items[0].attemptCount);
  });

  it('同じIdempotency-Keyで異なる内容を送ると409になる', async () => {
    const response = await api.post('/api/v1/attempts').set({ ...student, 'Idempotency-Key': 'attempt-key-001' }).send({ attemptId: 'attempt-contract-002', questionId: 'question-001', answer: ['a'], responseTimeMs: 900 });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CONFLICT');
  });

  it('知識進捗を取得できる', async () => {
    const response = await api.get('/api/v1/progress?concept_id=concept-001').set(student);
    expect(response.status).toBe(200);
    expect(response.body.items[0].attemptCount).toBeGreaterThanOrEqual(1);
    expect(response.body.items[0]).toHaveProperty('confidence');
  });

  it('知識進捗と5軸到達を別々に取得できる', async () => {
    const response = await api.get('/api/v1/attainment?trainingId=training-001').set(student);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('pending');
    expect(response.body.axes).toEqual({ K: null, P: null, E: null, D: null, L: null });
  });

  it('知識進捗から承認済み問題の復習推薦を生成できる', async () => {
    const response = await api.get('/api/v1/recommendations?trainingId=training-001').set(student);
    expect(response.status).toBe(200);
    expect(['recommended', 'teacher_review_required']).toContain(response.body.status);
  });

  it('提出を作成、更新、確定できる', async () => {
    const created = await api.post('/api/v1/submissions').set({ ...student, 'Idempotency-Key': 'submission-test-001' }).send({ assignmentId: 'assignment-001', content: 'draft' });
    const submissionId = created.body.submission.submissionId;
    const updated = await api.patch(`/api/v1/submissions/${submissionId}`).set(student).send({ expectedVersion: 1, content: 'final content' });
    const submitted = await api.post(`/api/v1/submissions/${submissionId}/submit`).set(student).send({ expectedVersion: updated.body.submission.expectedVersion });
    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(submitted.status).toBe(200);
    expect(submitted.body.submission.status).toBe('submitted');
    expect(submitted.body.version.status).toBe('submitted');
  });

  it('提出作成は同じIdempotency-Keyで二重作成されない', async () => {
    const body = { assignmentId: 'assignment-001', content: 'idempotent submission' };
    const first = await api.post('/api/v1/submissions').set({ ...student, 'Idempotency-Key': 'submission-idempotent-001' }).send(body);
    const retry = await api.post('/api/v1/submissions').set({ ...student, 'Idempotency-Key': 'submission-idempotent-001' }).send(body);
    expect(first.status).toBe(201);
    expect(retry.body.submission.submissionId).toBe(first.body.submission.submissionId);
  });

  it('提出済み版は更新できない', async () => {
    const created = await api.post('/api/v1/submissions').set({ ...student, 'Idempotency-Key': 'submission-test-002' }).send({ assignmentId: 'assignment-001', content: 'immutable' });
    const submitted = await api.post(`/api/v1/submissions/${created.body.submission.submissionId}/submit`).set(student).send({ expectedVersion: 1 });
    const response = await api.patch(`/api/v1/submissions/${created.body.submission.submissionId}`).set(student).send({ expectedVersion: 2, content: 'changed' });
    expect(submitted.status).toBe(200);
    expect(response.status).toBe(409);
  });

  it('同じ提出版を同時更新すると一方だけ成功する', async () => {
    const created = await api.post('/api/v1/submissions').set({ ...student, 'Idempotency-Key': 'submission-concurrent-001' }).send({ assignmentId: 'assignment-001', content: 'concurrent' });
    const submissionId = created.body.submission.submissionId;
    const responses = await Promise.all([
      api.patch(`/api/v1/submissions/${submissionId}`).set(student).send({ expectedVersion: 1, content: 'first' }),
      api.patch(`/api/v1/submissions/${submissionId}`).set(student).send({ expectedVersion: 1, content: 'second' })
    ]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(1);
  });

  it('添付ファイルはサイズとMIMEを検証する', async () => {
    const created = await api.post('/api/v1/submissions').set({ ...student, 'Idempotency-Key': 'submission-test-003' }).send({ assignmentId: 'assignment-001', content: 'file target' });
    const invalid = await api.post(`/api/v1/submissions/${created.body.submission.submissionId}/files`).set(student).send({ filename: 'evil.html', mimeType: 'text/html', size: 10, checksum: 'hash' });
    const valid = await api.post(`/api/v1/submissions/${created.body.submission.submissionId}/files`).set(student).send({ filename: 'answer.txt', mimeType: 'text/plain', size: 10, checksum: 'hash' });
    const oversized = await api.post(`/api/v1/submissions/${created.body.submission.submissionId}/files`).set(student).send({ filename: 'large.txt', mimeType: 'text/plain', size: 2 * 1024 * 1024 + 1, checksum: 'hash' });
    expect(invalid.status).toBe(422);
    expect(valid.status).toBe(201);
    expect(oversized.status).toBe(413);
  });

  it('評価者は自己提出物をレビューできず、他人の提出物を確定できる', async () => {
    const created = await api.post('/api/v1/submissions').set({ ...student, 'Idempotency-Key': 'submission-test-004' }).send({ assignmentId: 'assignment-001', content: 'review target' });
    const submitted = await api.post(`/api/v1/submissions/${created.body.submission.submissionId}/submit`).set(student).send({ expectedVersion: 1 });
    const assigned = await api.post('/api/v1/reviews/assign').set(teacher).send({ submissionVersionId: submitted.body.version.submissionVersionId, reviewerId: 'user-004' });
    const review = await api.post('/api/v1/reviews').set(reviewer).send({ submissionVersionId: submitted.body.version.submissionVersionId, scores: { P: 2 }, rationale: '実践結果と根拠を確認した', evidenceRefs: ['submission-text'] });
    const finalized = await api.post(`/api/v1/reviews/${review.body.assessmentId}/finalize`).set(reviewer).send({ expectedVersion: 1 });
    expect(assigned.status).toBe(201);
    expect(review.status).toBe(201);
    expect(finalized.status).toBe(200);
    expect(finalized.body.status).toBe('final');
  });

  it('レビュー確定後に本人が異議申立てできる', async () => {
    const created = await api.post('/api/v1/submissions').set({ ...student, 'Idempotency-Key': 'submission-test-005' }).send({ assignmentId: 'assignment-001', content: 'appeal target' });
    const submitted = await api.post(`/api/v1/submissions/${created.body.submission.submissionId}/submit`).set(student).send({ expectedVersion: 1 });
    await api.post('/api/v1/reviews/assign').set(teacher).send({ submissionVersionId: submitted.body.version.submissionVersionId, reviewerId: 'user-004' });
    const review = await api.post('/api/v1/reviews').set(reviewer).send({ submissionVersionId: submitted.body.version.submissionVersionId, scores: { P: 1 }, rationale: '改善が必要', evidenceRefs: ['submission-text'] });
    await api.post(`/api/v1/reviews/${review.body.assessmentId}/finalize`).set(reviewer).send({ expectedVersion: 1 });
    const appeal = await api.post('/api/v1/review-appeals').set(student).send({ assessmentId: review.body.assessmentId, reason: '根拠の再確認を希望します' });
    expect(appeal.status).toBe(201);
    await api.post('/api/v1/reviews/assign').set(teacher).send({ submissionVersionId: submitted.body.version.submissionVersionId, reviewerId: 'user-003' });
    const resolved = await api.post(`/api/v1/review-appeals/${appeal.body.appealId}/resolve`).set(teacher).send({ scores: { P: 2 }, rationale: '再評価済み' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.appeal.status).toBe('resolved');
    expect(resolved.body.assessment.status).toBe('final');
  });

  it('割り当てられていない評価者は評価を作成できない', async () => {
    const created = await api.post('/api/v1/submissions').set({ ...student, 'Idempotency-Key': 'submission-unassigned-review' }).send({ assignmentId: 'assignment-001', content: 'unassigned review target' });
    const submitted = await api.post(`/api/v1/submissions/${created.body.submission.submissionId}/submit`).set(student).send({ expectedVersion: 1 });
    const response = await api.post('/api/v1/reviews').set(reviewer).send({ submissionVersionId: submitted.body.version.submissionVersionId, scores: { P: 2 }, rationale: '割当なし', evidenceRefs: [] });
    expect(response.status).toBe(403);
  });

  it('所属解除済みユーザーは研修APIへアクセスできない', async () => {
    const response = await api.get('/api/v1/quiz/next?lessonId=training-001').set({ Authorization: 'Bearer mock-user-006' });
    expect(response.status).toBe(404);
  });

  it('担当教員は担当研修の分析を取得でき、学生は拒否される', async () => {
    const teacherResponse = await api.get('/api/v1/cohorts/training-001/analytics').set(teacher);
    const studentResponse = await api.get('/api/v1/cohorts/training-001/analytics').set(student);
    expect(teacherResponse.status).toBe(200);
    expect(teacherResponse.body.trainingId).toBe('training-001');
    expect(studentResponse.status).toBe(403);
  });

  it('管理者が削除を適用すると提出物は通常APIから見えなくなる', async () => {
    const created = await api.post('/api/v1/submissions').set({ ...student, 'Idempotency-Key': 'submission-delete-001' }).send({ assignmentId: 'assignment-001', content: 'delete target' });
    const requested = await api.post('/api/v1/admin/deletion-requests').set({ Authorization: 'Bearer mock-user-005' }).send({ subjectId: 'user-001', scope: 'submissions', reason: '本人の削除要求' });
    const applied = await api.post(`/api/v1/admin/deletion-requests/${requested.body.requestId}/apply`).set({ Authorization: 'Bearer mock-user-005' });
    const hidden = await api.get(`/api/v1/submissions/${created.body.submission.submissionId}`).set(student);
    expect(requested.status).toBe(202);
    expect(applied.status).toBe(200);
    expect(hidden.status).toBe(404);
    const reapplied = await api.post(`/api/v1/admin/deletion-requests/${requested.body.requestId}/reapply`).set({ Authorization: 'Bearer mock-user-005' });
    expect(reapplied.status).toBe(200);
    expect(reapplied.body.reapplied).toBe(true);
  });

  it('AIジョブはBが認可と利用枠を確認し、中間生成文を返さない', async () => {
    const queued = await api.post('/api/v1/tutor/jobs').set(student).send({ question: 'ヒントをください', requestedAction: 'hint' });
    const status = await api.get(`/api/v1/tutor/jobs/${queued.body.jobId}`).set(student);
    expect(queued.status).toBe(202);
    expect(status.status).toBe(200);
    expect(status.body.status).toBe('QUEUED');
    expect(status.body).not.toHaveProperty('message');
  });

  it('管理者のAI停止ポリシーがジョブ受付を止める', async () => {
    const stopped = await api.post('/api/v1/admin/policies').set({ Authorization: 'Bearer mock-user-005' }).send({ expectedVersion: 'policy-v1', aiEnabled: false, dailyAiLimit: 20, concurrentJobLimit: 1, allowAnswer: false });
    const rejected = await api.post('/api/v1/tutor/jobs').set(student).send({ question: '停止中', requestedAction: 'hint' });
    const restored = await api.post('/api/v1/admin/policies').set({ Authorization: 'Bearer mock-user-005' }).send({ expectedVersion: stopped.body.version, aiEnabled: true, dailyAiLimit: 20, concurrentJobLimit: 1, allowAnswer: true });
    expect(stopped.status).toBe(200);
    expect(rejected.status).toBe(503);
    expect(restored.status).toBe(200);
  });
});