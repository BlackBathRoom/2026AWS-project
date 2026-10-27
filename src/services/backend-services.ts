import { AuthContext } from '../contracts/user';
import { Axis, Attempt, CompetencyAssessment, KnowledgeProgress, Submission, SubmissionVersion } from '../contracts/backend';
import { asAssignmentId } from '../contracts/common';
import { randomUUID } from 'node:crypto';
import { backendRepository, InMemoryBackendRepository } from '../repositories/backend-repository';
import { mockUsers } from '../mocks/sample-data';

export class DomainError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

export function requireSelf(auth: AuthContext, userId: string): void { if (auth.userId !== userId) throw new DomainError(403, 'FORBIDDEN', '本人のデータだけ操作できます'); }
export function requireRole(auth: AuthContext, roles: string[]): void { if (!roles.includes(auth.role)) throw new DomainError(403, 'FORBIDDEN', '必要な権限がありません'); }
export function requireTraining(auth: AuthContext, trainingId: string): void { if (!auth.trainingIds.includes(trainingId as AuthContext['trainingIds'][number])) throw new DomainError(404, 'NOT_FOUND', '研修が見つかりません'); }
export function requireCurrentTraining(repo: InMemoryBackendRepository, auth: AuthContext, trainingId: string): void {
  requireTraining(auth, trainingId);
  const membership = repo.memberships.find((item) => item.userId === auth.userId && item.organizationId === auth.organizationId && item.trainingIds.includes(trainingId as AuthContext['trainingIds'][number]));
  if (!membership || membership.status !== 'active' || new Date(membership.startsAt).getTime() > Date.now() || (membership.endsAt && new Date(membership.endsAt).getTime() <= Date.now())) throw new DomainError(404, 'NOT_FOUND', '有効な研修所属が見つかりません');
}
export function requireDataAccess(repo: InMemoryBackendRepository, auth: AuthContext, scope: 'learning' | 'submissions'): void {
  const deleted = repo.deletions.some((item) => item.subjectId === auth.userId && item.status === 'applied' && (item.scope === 'all' || item.scope === scope));
  if (deleted) throw new DomainError(404, 'NOT_FOUND', '削除済みデータは利用できません');
}
export function requireOrganization(auth: AuthContext, organizationId: string): void { if (auth.organizationId !== organizationId) throw new DomainError(404, 'NOT_FOUND', 'リソースが見つかりません'); }

function findUser(userId: string): AuthContext | undefined { return Object.values(mockUsers).find((candidate) => candidate.userId === userId); }

function now(): string { return new Date().toISOString(); }
function dateJst(date = new Date()): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function addDays(iso: string, days: number): string { const date = new Date(iso); date.setUTCDate(date.getUTCDate() + days); return date.toISOString(); }
function audit(repo: InMemoryBackendRepository, auth: AuthContext, action: string, targetType: string, targetId: string): void { repo.audits.push({ eventId: `audit-${randomUUID()}` as import('../contracts/backend').AuditEventId, organizationId: auth.organizationId, actorId: auth.userId, action, targetType, targetId, result: 'allowed', occurredAt: now() }); }

export function getSafeQuestion(repo: InMemoryBackendRepository, auth: AuthContext, questionId: string) {
  const question = repo.getQuestion(questionId);
  if (!question || question.approvalStatus !== 'APPROVED') throw new DomainError(404, 'NOT_FOUND', '承認済み問題が見つかりません');
  requireOrganization(auth, question.organizationId);
  requireCurrentTraining(repo, auth, question.trainingId);
  const { correctAnswer: _correctAnswer, ...safeQuestion } = question;
  return safeQuestion;
}

export function nextQuestion(repo: InMemoryBackendRepository, auth: AuthContext, lessonId: string, retryOf?: string) {
  requireDataAccess(repo, auth, 'learning');
  requireCurrentTraining(repo, auth, lessonId);
  const retryAttempt = retryOf ? repo.attempts.find((item) => item.attemptId === retryOf && item.userId === auth.userId) : undefined;
  if (retryOf && !retryAttempt) throw new DomainError(404, 'NOT_FOUND', '再回答元が見つかりません');
  const question = repo.questions.find((item) => item.trainingId === lessonId && item.organizationId === auth.organizationId && item.approvalStatus === 'APPROVED' && (!retryAttempt || item.questionId === retryAttempt.questionId));
  if (!question) throw new DomainError(404, 'NOT_FOUND', '出題可能な承認済み問題がありません');
  const root = `attempt-${randomUUID()}` as Attempt['attemptId'];
  const { correctAnswer: _correctAnswer, ...safeQuestion } = question;
  return { attemptId: root, rootAttemptId: retryAttempt?.rootAttemptId || root, ...safeQuestion, reason: retryAttempt ? '同じrootへの練習再回答' : '承認済み問題から出題', mode: 'learning' as const };
}

function calculateProgress(repo: InMemoryBackendRepository, auth: AuthContext, conceptId: string): KnowledgeProgress {
  const attempts = repo.attempts.filter((item) => item.userId === auth.userId && item.conceptId === conceptId && item.scored).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-10);
  const n = attempts.length;
  const weighted = attempts.reduce((sum, item, index) => sum + (item.correct ? 1 : 0) * (index >= Math.max(0, n - 5) ? 2 : 1), 0);
  const weights = attempts.reduce((sum, _item, index) => sum + (index >= Math.max(0, n - 5) ? 2 : 1), 0);
  const score = n < 3 ? null : Math.round((100 * weighted) / weights);
  const formatCount = new Set(attempts.map((item) => repo.getQuestion(item.questionId)?.format)).size;
  const confidence = n < 3 ? 'unmeasured' : n < 5 ? 'low' : n < 10 || formatCount < 2 ? 'medium' : 'high';
  const recentWrong = attempts.slice(-5).filter((item) => item.correct === false).length;
  const reasons = n >= 5 && score !== null && score < 60 && recentWrong >= 3 ? ['直近5件中3件以上が不正解'] : [];
  const mastered = n >= 10 && score !== null && score >= 80 && attempts.slice(-5).filter((item) => item.correct).length >= 4 && formatCount >= 2;
  const previous = repo.progress.find((item) => item.userId === auth.userId && item.conceptId === conceptId);
  const nextReviewAt = mastered ? addDays(now(), previous?.nextReviewAt ? 3 : 1) : null;
  const progress: KnowledgeProgress = { userId: auth.userId, organizationId: auth.organizationId, trainingId: attempts[0]?.trainingId || auth.trainingIds[0], conceptId: conceptId as KnowledgeProgress['conceptId'], score, confidence, reasons, nextReviewAt, mastery: mastered ? 'mastered' : 'developing', attemptCount: n, formatCount };
  const index = repo.progress.findIndex((item) => item.userId === auth.userId && item.conceptId === conceptId);
  if (index >= 0) repo.progress[index] = progress; else repo.progress.push(progress);
  return progress;
}

export function saveAttempt(repo: InMemoryBackendRepository, auth: AuthContext, input: { attemptId: string; questionId: string; answer: string[]; responseTimeMs: number; idempotencyKey: string; retryOf?: string }) {
  if (!input.idempotencyKey) throw new DomainError(422, 'UNPROCESSABLE_ENTITY', 'Idempotency-Keyが必要です');
  const key = `${auth.userId}:${input.idempotencyKey}`;
  const existing = repo.idempotency.get(key) as { fingerprint: string; response: unknown } | undefined;
  const fingerprint = JSON.stringify({ questionId: input.questionId, answer: input.answer, responseTimeMs: input.responseTimeMs, retryOf: input.retryOf });
  if (existing) { if (existing.fingerprint !== fingerprint) throw new DomainError(409, 'CONFLICT', '同じIdempotency-Keyに異なる内容を指定できません'); return existing.response; }
  const question = repo.getQuestion(input.questionId);
  if (!question || question.approvalStatus !== 'APPROVED') throw new DomainError(404, 'NOT_FOUND', '承認済み問題が見つかりません');
  requireOrganization(auth, question.organizationId); requireCurrentTraining(repo, auth, question.trainingId);
  if (!Array.isArray(input.answer) || input.answer.length === 0 || input.responseTimeMs < 0) throw new DomainError(422, 'UNPROCESSABLE_ENTITY', '解答形式が不正です');
  const retryAttempt = input.retryOf ? repo.attempts.find((item) => item.attemptId === input.retryOf && item.userId === auth.userId) : undefined;
  if (input.retryOf && (!retryAttempt || retryAttempt.questionId !== question.questionId)) throw new DomainError(409, 'CONFLICT', '再回答元と問題が一致しません');
  const correct = [...input.answer].sort().join(',') === [...question.correctAnswer].sort().join(',');
  const isPractice = Boolean(retryAttempt);
  const attempt: Attempt = { attemptId: input.attemptId as Attempt['attemptId'], rootAttemptId: retryAttempt?.rootAttemptId || input.attemptId as Attempt['attemptId'], retryOf: retryAttempt?.attemptId, userId: auth.userId, organizationId: auth.organizationId, trainingId: question.trainingId, questionId: question.questionId, questionVersionId: question.version, answer: input.answer, responseTimeMs: input.responseTimeMs, kind: isPractice ? 'practice' : 'initial', status: isPractice ? 'unscored' : 'scored', correct, scored: !isPractice, conceptId: question.conceptId, idempotencyKey: input.idempotencyKey, createdAt: now() };
  if (repo.attempts.some((item) => item.attemptId === attempt.attemptId)) throw new DomainError(409, 'CONFLICT', 'attempt_idが重複しています');
  repo.attempts.push(attempt);
  repo.histories.push({ userId: auth.userId, attemptId: attempt.attemptId, conceptId: question.conceptId, action: 'answer', occurredAt: attempt.createdAt });
  const progress = isPractice ? repo.progress.find((item) => item.userId === auth.userId && item.conceptId === question.conceptId) : calculateProgress(repo, auth, question.conceptId);
  const response = { attemptId: attempt.attemptId, result: correct ? 'correct' : 'incorrect', scored: !isPractice, mastery: progress?.score ?? null, confidence: progress?.confidence ?? 'unmeasured', nextAction: isPractice ? 'continue' : progress?.reasons.length ? 'review' : 'continue' };
  repo.idempotency.set(key, { fingerprint, response });
  return response;
}

export function getProgress(repo: InMemoryBackendRepository, auth: AuthContext, conceptId?: string) {
  requireDataAccess(repo, auth, 'learning');
  const ids = conceptId ? [conceptId] : [...new Set(repo.questions.filter((item) => item.organizationId === auth.organizationId).map((item) => item.conceptId))];
  return ids.map((id) => calculateProgress(repo, auth, id));
}

export function getRecommendations(repo: InMemoryBackendRepository, auth: AuthContext, trainingId: string) {
  requireCurrentTraining(repo, auth, trainingId);
  const progress = getProgress(repo, auth).filter((item) => item.trainingId === trainingId);
  if (repo.knowledgeEdges.filter((edge) => edge.organizationId === auth.organizationId && edge.approvalStatus === 'APPROVED').length === 0) return { status: 'teacher_review_required', items: [], reason: '承認済み知識マップが未登録です' };
  const candidates = progress.filter((item) => item.score === null || item.reasons.length > 0 || (item.nextReviewAt !== null && item.nextReviewAt <= now()));
  return { status: candidates.length ? 'recommended' : 'teacher_review_required', items: candidates.map((item) => ({ conceptId: item.conceptId, reason: item.reasons.length ? item.reasons : ['確認問題が必要です'], priority: item.score === null ? 'insufficient_data' : 'weakness', questionIds: repo.questions.filter((question) => question.conceptId === item.conceptId && question.trainingId === trainingId && question.approvalStatus === 'APPROVED').slice(0, 3).map((question) => question.questionId) })) };
}

export function createSubmission(repo: InMemoryBackendRepository, auth: AuthContext, assignmentId: string, content: string) {
  requireDataAccess(repo, auth, 'submissions');
  const assignment = repo.getAssignment(assignmentId); if (!assignment) throw new DomainError(404, 'NOT_FOUND', '課題が見つかりません');
  requireOrganization(auth, assignment.organizationId); requireCurrentTraining(repo, auth, assignment.trainingId); requireRole(auth, ['student']);
  const timestamp = now(); const submission: Submission = { submissionId: `submission-${randomUUID()}` as Submission['submissionId'], organizationId: auth.organizationId, trainingId: assignment.trainingId, assignmentId: assignment.assignmentId, ownerId: auth.userId, currentVersion: 1, status: 'draft', expectedVersion: 1, createdAt: timestamp, updatedAt: timestamp };
  const version: SubmissionVersion = { submissionVersionId: `submission-version-${randomUUID()}` as SubmissionVersion['submissionVersionId'], submissionId: submission.submissionId, assignmentId: asAssignmentId(assignmentId), assignmentVersion: assignment.version, ownerId: auth.userId, versionNumber: 1, content, fileIds: [], aidDeclaration: 'none', status: 'draft', submittedAt: null };
  repo.submissions.push(submission); repo.submissionVersions.push(version); return { submission, version };
}

export function updateSubmission(repo: InMemoryBackendRepository, auth: AuthContext, submissionId: string, expectedVersion: number, content: string) {
  requireDataAccess(repo, auth, 'submissions');
  const submission = repo.submissions.find((item) => item.submissionId === submissionId); if (!submission || submission.ownerId !== auth.userId) throw new DomainError(404, 'NOT_FOUND', '提出物が見つかりません');
  if (submission.status !== 'draft' || !repo.conditionalUpdate(submission.expectedVersion, expectedVersion, () => undefined)) throw new DomainError(409, 'CONFLICT', '提出物の版が競合しています');
  const version = repo.submissionVersions.find((item) => item.submissionId === submissionId && item.versionNumber === submission.currentVersion)!; version.content = content; submission.expectedVersion += 1; submission.updatedAt = now(); return { submission, version };
}

export function submitSubmission(repo: InMemoryBackendRepository, auth: AuthContext, submissionId: string, expectedVersion: number, content?: string) {
  requireDataAccess(repo, auth, 'submissions');
  const submission = repo.submissions.find((item) => item.submissionId === submissionId); if (!submission || submission.ownerId !== auth.userId) throw new DomainError(404, 'NOT_FOUND', '提出物が見つかりません');
  if (submission.status === 'submitted' && content !== undefined) {
    if (!repo.conditionalUpdate(submission.expectedVersion, expectedVersion, () => undefined)) throw new DomainError(409, 'CONFLICT', '提出物の版が競合しています');
    const assignment = repo.getAssignment(submission.assignmentId); if (!assignment) throw new DomainError(404, 'NOT_FOUND', '課題が見つかりません');
    const version: SubmissionVersion = { submissionVersionId: `submission-version-${randomUUID()}` as SubmissionVersion['submissionVersionId'], submissionId: submission.submissionId, assignmentId: submission.assignmentId, assignmentVersion: assignment.version, ownerId: auth.userId, versionNumber: submission.currentVersion + 1, content, fileIds: [], aidDeclaration: 'none', status: 'submitted', submittedAt: now() };
    repo.submissionVersions.push(version); submission.currentVersion = version.versionNumber; submission.expectedVersion += 1; submission.updatedAt = now(); return { submission, version };
  }
  if (submission.status !== 'draft' || !repo.conditionalUpdate(submission.expectedVersion, expectedVersion, () => undefined)) throw new DomainError(409, 'CONFLICT', '提出物の版が競合しています');
  const version = repo.submissionVersions.find((item) => item.submissionId === submissionId && item.versionNumber === submission.currentVersion)!;
  if (!version.content.trim()) throw new DomainError(422, 'UNPROCESSABLE_ENTITY', '提出本文が必要です');
  submission.status = 'submitted'; version.status = 'submitted'; version.submittedAt = now(); submission.expectedVersion += 1; submission.updatedAt = now(); return { submission, version };
}

export function finalizeAssessment(repo: InMemoryBackendRepository, auth: AuthContext, assessmentId: string, expectedVersion: number) {
  const assessment = repo.assessments.find((item) => item.assessmentId === assessmentId); if (!assessment) throw new DomainError(404, 'NOT_FOUND', '評価が見つかりません');
  const submissionVersion = repo.submissionVersions.find((item) => item.submissionVersionId === assessment.submissionVersionId); if (!submissionVersion) throw new DomainError(404, 'NOT_FOUND', '提出版が見つかりません');
  if (submissionVersion.ownerId === auth.userId) throw new DomainError(403, 'FORBIDDEN', '自分の提出物は評価できません');
  if (assessment.reviewerId !== auth.userId) throw new DomainError(403, 'FORBIDDEN', '割り当てられた評価者ではありません');
  if (assessment.status !== 'draft' || !repo.conditionalUpdate(assessment.version, expectedVersion, () => undefined)) throw new DomainError(409, 'CONFLICT', '評価の版が競合しています');
  if (!assessment.rationale.trim() || Object.keys(assessment.scores).length === 0) throw new DomainError(422, 'UNPROCESSABLE_ENTITY', '評価根拠と観点別点数が必要です');
  assessment.status = 'final'; assessment.version += 1;
  const assignment = repo.reviewAssignments.find((item) => item.submissionVersionId === assessment.submissionVersionId && item.reviewerId === auth.userId);
  if (assignment) assignment.status = 'completed';
  const submission = repo.submissions.find((item) => item.submissionId === submissionVersion.submissionId);
  if (submission) submission.status = 'reviewed';
  return assessment;
}

export function assignReview(repo: InMemoryBackendRepository, auth: AuthContext, submissionVersionId: string, reviewerId: string) {
  requireRole(auth, ['teacher', 'admin']);
  const version = repo.submissionVersions.find((item) => item.submissionVersionId === submissionVersionId);
  if (!version) throw new DomainError(404, 'NOT_FOUND', '提出版が見つかりません');
  const submission = repo.submissions.find((item) => item.submissionId === version.submissionId);
  if (!submission) throw new DomainError(404, 'NOT_FOUND', '提出物が見つかりません');
  requireOrganization(auth, submission.organizationId);
  const reviewer = findUser(reviewerId);
  if (!reviewer || reviewer.organizationId !== auth.organizationId || !['reviewer', 'teacher'].includes(reviewer.role) || !reviewer.trainingIds.includes(submission.trainingId)) throw new DomainError(403, 'FORBIDDEN', '評価者を割り当てできません');
  if (repo.reviewAssignments.some((item) => item.submissionVersionId === submissionVersionId && item.reviewerId === reviewer.userId && item.status === 'assigned')) throw new DomainError(409, 'CONFLICT', '評価者は既に割り当て済みです');
  const assignment = { reviewId: `review-${randomUUID()}` as import('../contracts/common').ReviewId, submissionVersionId: version.submissionVersionId, reviewerId: reviewer.userId, organizationId: auth.organizationId, status: 'assigned' as const };
  repo.reviewAssignments.push(assignment);
  audit(repo, auth, 'review.assign', 'submission_version', submissionVersionId);
  return assignment;
}

export function calculateAttainment(repo: InMemoryBackendRepository, auth: AuthContext, trainingId: string) {
  const finalAssessments = repo.assessments.filter((item) => item.status === 'final').filter((assessment) => { const version = repo.submissionVersions.find((candidate) => candidate.submissionVersionId === assessment.submissionVersionId); return version?.ownerId === auth.userId; });
  const scores: Partial<Record<Axis, number | null>> = {};
  for (const axis of ['K', 'P', 'E', 'D', 'L'] as Axis[]) { const values = finalAssessments.map((item) => item.scores[axis]).filter((value): value is number => value !== null && value !== undefined); scores[axis] = values.length ? Math.max(...values) : null; }
  const required = repo.assignments.filter((item) => item.trainingId === trainingId && item.required && item.status === 'published');
  const submitted = required.every((assignment) => repo.submissions.some((item) => item.assignmentId === assignment.assignmentId && item.ownerId === auth.userId && item.status === 'submitted'));
  const attained = submitted && (['K', 'P', 'E', 'D', 'L'] as Axis[]).every((axis) => scores[axis] !== null && (scores[axis] || 0) >= 2);
  const result = { trainingId: trainingId as import('../contracts/common').TrainingId, axes: scores, status: (attained ? 'attained' : Object.values(scores).some((value) => value === null) ? 'pending' : 'not_attained') as import('../contracts/backend').AttainmentStatus, evidenceRefs: finalAssessments.flatMap((item) => item.evidenceRefs) };
  const attainment = { userId: auth.userId, ...result, rubricVersionId: 'rubric-v1' as import('../contracts/common').RubricVersionId };
  const existing = repo.attainments.find((item) => item.userId === auth.userId && item.trainingId === trainingId);
  if (existing) Object.assign(existing, attainment); else repo.attainments.push(attainment);
  return result;
}

export function reserveAi(repo: InMemoryBackendRepository, auth: AuthContext) {
  const policy = repo.getPolicy(auth.organizationId); if (!policy || !policy.aiEnabled) throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'AI機能は停止中です');
  const today = dateJst(); let counter = repo.usage.find((item) => item.userId === auth.userId && item.dateJst === today); if (!counter) { counter = { userId: auth.userId, dateJst: today, aiCount: 0, activeJobs: 0 }; repo.usage.push(counter); }
  if (counter.aiCount >= policy.dailyAiLimit || counter.activeJobs >= policy.concurrentJobLimit) throw new DomainError(429, 'RATE_LIMITED', '利用上限に達しています'); counter.aiCount += 1; counter.activeJobs += 1; return { dateJst: today, remaining: policy.dailyAiLimit - counter.aiCount };
}

export function completeTutorJob(repo: InMemoryBackendRepository, auth: AuthContext, jobId: string, result: NonNullable<import('../contracts/backend').TutorJob['result']>) {
  const job = repo.jobs.find((item) => item.jobId === jobId && item.userId === auth.userId && item.organizationId === auth.organizationId);
  if (!job) throw new DomainError(404, 'NOT_FOUND', 'AIジョブが見つかりません');
  job.status = result.status === 'ERROR' || result.status === 'UNAVAILABLE' ? 'FAILED' : 'COMPLETED'; job.result = result;
  const counter = repo.usage.find((item) => item.userId === auth.userId && item.activeJobs > 0); if (counter) counter.activeJobs -= 1;
  return { jobId: job.jobId, status: job.status, result: job.result };
}

export function applyDeletion(repo: InMemoryBackendRepository, auth: AuthContext, requestId: string) {
  requireRole(auth, ['admin']);
  const record = repo.deletions.find((item) => item.requestId === requestId && item.organizationId === auth.organizationId);
  if (!record) throw new DomainError(404, 'NOT_FOUND', '削除要求が見つかりません');
  if (record.status === 'applied') return record;
  if (record.scope === 'all' || record.scope === 'learning') repo.attempts = repo.attempts.filter((item) => item.userId !== record.subjectId);
  if (record.scope === 'all' || record.scope === 'submissions') {
    for (const submission of repo.submissions.filter((item) => item.ownerId === record.subjectId)) submission.status = 'deleted';
    for (const file of repo.files.filter((item) => item.ownerId === record.subjectId)) file.scanStatus = 'rejected';
  }
  if (record.scope === 'all' || record.scope === 'learning') {
    repo.progress = repo.progress.filter((item) => item.userId !== record.subjectId);
    repo.histories = repo.histories.filter((item) => item.userId !== record.subjectId);
    repo.attainments = repo.attainments.filter((item) => item.userId !== record.subjectId);
  }
  if (record.scope === 'all') repo.profiles = repo.profiles.filter((item) => item.userId !== record.subjectId);
  record.status = 'applied';
  audit(repo, auth, 'data.delete', 'user', record.subjectId);
  return record;
}

export function reapplyDeletionLedger(repo: InMemoryBackendRepository, auth: AuthContext, requestId: string) {
  const record = applyDeletion(repo, auth, requestId);
  return { requestId: record.requestId, status: record.status, reapplied: true };
}

export function getUsage(repo: InMemoryBackendRepository, auth: AuthContext) {
  const policy = repo.getPolicy(auth.organizationId);
  return { userId: auth.userId, dailyLimit: policy?.dailyAiLimit ?? 0, counters: repo.usage.filter((item) => item.userId === auth.userId) };
}

export { backendRepository };