import { describe, expect, it } from 'vitest';
import {
  assessGrounding,
  formatCitations,
  resolveResponseType,
  type RetrievedChunk,
} from '../src/integrations/rag-governance';
import { BedrockRagTutor, type BedrockRagConfig } from '../src/integrations/bedrock-ai-provider';
import { InMemoryTutorJobStore } from '../src/repositories/tutor-job-store';
import { handleEvent } from '../src/ai-worker';
import { InternalStudyContext } from '../src/contracts/study-context';
import type { AuditEvent } from '../src/contracts/backend';
import { asAssignmentId, asOrganizationId, asRuleVersionId, asTrainingId, asUserId } from '../src/contracts/common';

const config: BedrockRagConfig = {
  knowledgeBaseId: 'kb-001',
  modelId: 'model-001',
  maxResults: 5,
  thresholds: { minChunks: 1, minScore: 0.5, outOfScopeMaxScore: 0.2 },
};

function chunk(score: number, sourceId = 'src-1'): RetrievedChunk {
  return { chunkId: `c-${score}`, sourceId, score, content: `教材本文 ${sourceId}`, citation: { sourceId, chapter: '第1章', lesson: '学習2', page: 'p.10' } };
}

function learningContext(overrides: Partial<InternalStudyContext> = {}): InternalStudyContext {
  return {
    userId: asUserId('user-1'),
    organizationId: asOrganizationId('org-1'),
    trainingId: asTrainingId('training-1'),
    assignmentId: asAssignmentId('assign-1'),
    mode: 'learning',
    assistancePolicy: 'hint',
    ruleVersionId: asRuleVersionId('rule-1'),
    purpose: 'learning',
    conceptIds: ['concept-1'],
    allowAnswer: true,
    policyVersion: 'policy-v1',
    ...overrides,
  };
}

/** Bedrock クライアントのスタブ。retrieve 結果と生成文を差し替えられる。 */
function fakeTutor(chunks: RetrievedChunk[], generated = '教材に基づくヒントです') {
  const agentRuntime = { send: async () => ({ retrievalResults: chunks.map((chunk) => ({ score: chunk.score, content: { text: chunk.content }, metadata: { source_id: chunk.citation.sourceId, chunk_id: chunk.chunkId, chapter: chunk.citation.chapter, lesson: chunk.citation.lesson, page: chunk.citation.page } })) }) };
  const runtime = { send: async () => ({ output: { message: { content: [{ text: generated }] } } }) };
  return new BedrockRagTutor(config, agentRuntime as never, runtime as never);
}

describe('根拠充足判定 (G-002/G-004)', () => {
  it('関連チャンクが無ければ OUT_OF_SCOPE', () => {
    expect(assessGrounding([chunk(0.1)], config.thresholds).status).toBe('OUT_OF_SCOPE');
  });
  it('関連はあるがスコア不足なら INSUFFICIENT', () => {
    expect(assessGrounding([chunk(0.3)], config.thresholds).status).toBe('INSUFFICIENT');
  });
  it('充足条件を満たせば SUPPORTED', () => {
    expect(assessGrounding([chunk(0.8)], config.thresholds).status).toBe('SUPPORTED');
  });
});

describe('response_type 制御 (G-003/G-004)', () => {
  it('評価モードでは answer 要求でも ANSWER を出さない', () => {
    const resolved = resolveResponseType({ requestedAction: 'answer', mode: 'assessment', allowAnswer: true, grounding: 'SUPPORTED' });
    expect(resolved.responseType).toBe('HINT');
  });
  it('allowAnswer=false なら ANSWER を HINT に降格', () => {
    const resolved = resolveResponseType({ requestedAction: 'answer', mode: 'learning', allowAnswer: false, grounding: 'SUPPORTED' });
    expect(resolved.responseType).toBe('HINT');
  });
  it('学習モードかつ allowAnswer なら ANSWER を許可', () => {
    const resolved = resolveResponseType({ requestedAction: 'answer', mode: 'learning', allowAnswer: true, grounding: 'SUPPORTED' });
    expect(resolved.responseType).toBe('ANSWER');
  });
  it('根拠不足時は常に NO_ANSWER', () => {
    expect(resolveResponseType({ requestedAction: 'explanation', mode: 'learning', allowAnswer: true, grounding: 'INSUFFICIENT' }).responseType).toBe('NO_ANSWER');
    expect(resolveResponseType({ requestedAction: 'explanation', mode: 'learning', allowAnswer: true, grounding: 'OUT_OF_SCOPE' }).responseType).toBe('NO_ANSWER');
  });
});

describe('引用整形 (G-005)', () => {
  it('教材ID/章/学習/ページを重複排除して整形する', () => {
    const citations = formatCitations([chunk(0.8, 'src-1'), chunk(0.8, 'src-1'), chunk(0.8, 'src-2')]);
    expect(citations).toEqual(['src-1 / 第1章 / 学習2 / p.10', 'src-2 / 第1章 / 学習2 / p.10']);
  });
});

describe('BedrockRagTutor.answer', () => {
  it('SUPPORTED時に本文と出典を返す', async () => {
    const tutor = fakeTutor([chunk(0.9)]);
    const result = await tutor.answer({ question: '決定木とは', context: learningContext(), requestedAction: 'hint' });
    expect(result.status).toBe('SUPPORTED');
    expect(result.responseType).toBe('HINT');
    expect(result.message).toContain('ヒント');
    expect(result.citations.length).toBeGreaterThan(0);
  });

  it('範囲外の質問は本文を生成せず案内する', async () => {
    const tutor = fakeTutor([chunk(0.05)]);
    const result = await tutor.answer({ question: '天気予報を教えて', context: learningContext(), requestedAction: 'answer' });
    expect(result.status).toBe('OUT_OF_SCOPE');
    expect(result.responseType).toBe('NO_ANSWER');
    expect(result.citations).toEqual([]);
    expect(result.message).toContain('範囲外');
  });

  it('評価モードでは ANSWER 要求でもヒントに降格する', async () => {
    const tutor = fakeTutor([chunk(0.9)]);
    const result = await tutor.answer({ question: '答えを教えて', context: learningContext({ mode: 'assessment' }), requestedAction: 'answer' });
    expect(result.responseType).toBe('HINT');
  });

  it('SUPPORTEDでも本文が空なら INSUFFICIENT に安全側転換する', async () => {
    const tutor = fakeTutor([chunk(0.9)], '');
    const result = await tutor.answer({ question: '決定木とは', context: learningContext(), requestedAction: 'explanation' });
    expect(result.status).toBe('INSUFFICIENT');
    expect(result.responseType).toBe('NO_ANSWER');
  });
});

describe('AI worker (SQS→Bedrock→Store→Audit)', () => {
  it('ジョブを COMPLETED にし監査ログを記録する', async () => {
    const store = new InMemoryTutorJobStore();
    await store.create({ jobId: 'job-1', userId: asUserId('user-1'), organizationId: asOrganizationId('org-1'), status: 'QUEUED' });
    const audits: AuditEvent[] = [];
    const tutor = fakeTutor([chunk(0.9)]);
    const message = { jobId: 'job-1', userId: 'user-1', organizationId: 'org-1', question: '決定木とは', requestedAction: 'hint', context: learningContext() };
    const response = await handleEvent({ Records: [{ messageId: 'm1', body: JSON.stringify(message) }] }, { tutor, store, audit: { write: async (e) => { audits.push(e); } } });
    expect(response.batchItemFailures).toEqual([]);
    const job = await store.get('job-1', { userId: 'user-1', organizationId: 'org-1' });
    expect(job?.status).toBe('COMPLETED');
    expect(job?.result?.status).toBe('SUPPORTED');
    expect(audits[0].targetType).toBe('AIInteraction');
    expect(audits[0].result).toBe('allowed');
  });

  it('Bedrock失敗時はジョブをFAILEDにし部分バッチ失敗を返す', async () => {
    const store = new InMemoryTutorJobStore();
    await store.create({ jobId: 'job-2', userId: asUserId('user-1'), organizationId: asOrganizationId('org-1'), status: 'QUEUED' });
    const failingTutor = { answer: async () => { throw new Error('BedrockUnavailable'); } };
    const message = { jobId: 'job-2', userId: 'user-1', organizationId: 'org-1', question: 'q', requestedAction: 'hint', context: learningContext() };
    const response = await handleEvent({ Records: [{ messageId: 'm2', body: JSON.stringify(message) }] }, { tutor: failingTutor, store });
    expect(response.batchItemFailures).toEqual([{ itemIdentifier: 'm2' }]);
    const job = await store.get('job-2', { userId: 'user-1', organizationId: 'org-1' });
    expect(job?.status).toBe('FAILED');
    expect(job?.result?.status).toBe('ERROR');
  });

  it('不正メッセージは握りつぶし再処理しない', async () => {
    const store = new InMemoryTutorJobStore();
    const tutor = fakeTutor([chunk(0.9)]);
    const response = await handleEvent({ Records: [{ messageId: 'm3', body: '{"invalid":true}' }] }, { tutor, store });
    expect(response.batchItemFailures).toEqual([]);
  });

  it('所有者が異なるとジョブ状態を返さない', async () => {
    const store = new InMemoryTutorJobStore();
    await store.create({ jobId: 'job-3', userId: asUserId('user-1'), organizationId: asOrganizationId('org-1'), status: 'QUEUED' });
    const other = await store.get('job-3', { userId: 'user-2', organizationId: 'org-1' });
    expect(other).toBeUndefined();
  });
});
