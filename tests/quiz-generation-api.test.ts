import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { setQuizGenerator } from '../src/integrations/quiz-generator-factory';
import type { QuizGenerationResult } from '../src/integrations/bedrock-quiz-generator';

const api = request(app);
const teacher = { Authorization: 'Bearer mock-user-003' };
const student = { Authorization: 'Bearer mock-user-001' };

// 疑似の問題生成器。Bedrock を呼ばずに決まった下書き問題を返す。
function fakeGeneratedResult(chapter: number): QuizGenerationResult {
  return {
    status: 'GENERATED',
    chapter,
    model: 'model-test',
    questions: [
      { format: 'single_choice', prompt: `第${chapter}章の確認問題`, choices: ['誤り', '正しい', '不明'], correctAnswer: ['b'], explanation: '教材の記述による。', conceptTag: `ch${chapter}概念`, chapter, citations: [`0${chapter}_chapter${chapter}.pdf / PDF 3ページ`] },
    ],
  };
}

describe('章別AI生成小テスト: 生成→承認→出題', () => {
  beforeEach(() => {
    setQuizGenerator({ generateForChapter: async (chapter: number) => fakeGeneratedResult(chapter) });
  });
  afterEach(() => {
    setQuizGenerator(undefined);
  });

  it('生成器が未設定なら503を返す', async () => {
    setQuizGenerator(null);
    const response = await api.post('/api/v1/quiz/generate').set(teacher).send({ chapter: 2 });
    expect(response.status).toBe(503);
  });

  it('教員は章別問題を生成でき、下書き(未承認)として保存される', async () => {
    const response = await api.post('/api/v1/quiz/generate').set(teacher).send({ chapter: 2, count: 1 });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('GENERATED');
    expect(response.body.drafts).toHaveLength(1);
    expect(response.body.drafts[0].status).toBe('DRAFT');
    expect(response.body.drafts[0].citations[0]).toContain('.pdf');
  });

  it('学生は問題を生成できない', async () => {
    const response = await api.post('/api/v1/quiz/generate').set(student).send({ chapter: 2 });
    expect(response.status).toBe(403);
  });

  it('下書きは承認されるまで出題プールに入らず、承認後に出題・採点できる', async () => {
    const generated = await api.post('/api/v1/quiz/generate').set(teacher).send({ chapter: 5, count: 1 });
    const draftId = generated.body.drafts[0].draftId;

    // 承認前: この下書きは ApprovedQuestion として存在しない（出題プールに未登録）。
    // 第5章にはシード済みの承認問題があるため /quiz/next 自体は出題できるが、
    // 生成した下書き由来の questionId は決して返らない。
    for (let i = 0; i < 12; i++) {
      const sample = await api.get('/api/v1/quiz/next?lessonId=ii-5').set(student);
      expect(sample.status).toBe(200);
      expect(String(sample.body.questionId)).not.toMatch(/^question-ai-/);
    }

    // 承認すると ApprovedQuestion（question-ai-*）へ昇格する。
    const approved = await api.post(`/api/v1/quiz/drafts/${draftId}/approve`).set(teacher);
    expect(approved.status).toBe(201);
    expect(approved.body.question.approvalStatus).toBe('APPROVED');
    expect(approved.body.question.chapter).toBe(5);
    expect(String(approved.body.question.questionId)).toMatch(/^question-ai-/);

    // 承認済みの生成問題に直接回答でき、章別正答率へ反映される（scored:true）。
    const questionId = approved.body.question.questionId;
    const attempt = await api.post('/api/v1/attempts').set({ ...student, 'Idempotency-Key': `gen-approve-${draftId}` }).send({ attemptId: `at-gen-${draftId}`, questionId, answer: ['b'], responseTimeMs: 400 });
    expect(attempt.status).toBe(201);
    expect(attempt.body.result).toBe('correct');
    expect(attempt.body.scored).toBe(true);
  });

  it('却下した下書きは承認できない', async () => {
    const generated = await api.post('/api/v1/quiz/generate').set(teacher).send({ chapter: 1, count: 1 });
    const draftId = generated.body.drafts[0].draftId;
    const rejected = await api.post(`/api/v1/quiz/drafts/${draftId}/reject`).set(teacher);
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('REJECTED');
    const approve = await api.post(`/api/v1/quiz/drafts/${draftId}/approve`).set(teacher);
    expect(approve.status).toBe(409);
  });

  it('下書き一覧を状態で絞り込める', async () => {
    await api.post('/api/v1/quiz/generate').set(teacher).send({ chapter: 4, count: 1 });
    const list = await api.get('/api/v1/quiz/drafts?chapter=4&status=DRAFT').set(teacher);
    expect(list.status).toBe(200);
    expect(list.body.items.every((item: { chapter: number; status: string }) => item.chapter === 4 && item.status === 'DRAFT')).toBe(true);
  });
});
