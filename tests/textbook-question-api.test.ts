import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
const fake = vi.hoisted(() => ({ reserve: vi.fn(), release: vi.fn(), enqueue: vi.fn(), getJob: vi.fn() }));
vi.mock('../src/repositories/textbook-ai-quota', () => ({ TextbookAiQuota: class { reserve = fake.reserve; release = fake.release; } }));
vi.mock('../src/integrations/tutor-provider-factory', () => ({ resolveTutorProvider: () => ({ enqueue: fake.enqueue, getJob: fake.getJob }) }));
import { app } from '../src/app';
import { SqsAiTutorProvider } from '../src/integrations/aws-ai-provider';
import { InMemoryTutorJobStore } from '../src/repositories/tutor-job-store';
import { handleEvent } from '../src/ai-worker';
import { tutorJobMessageSchema } from '../src/integrations/tutor-message';

const readerContext = { filename: '03_chapter3_part2.pdf', page: 1, text: '表示ページの本文' };
const post = (body: object, id = 'ii-3') => request(app).post(`/api/v1/materials/${id}/questions`).auth('mock-user-001', { type: 'bearer' }).send(body);

describe('textbook question acceptance and queue wiring', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('TEXTBOOK_AI_ENABLED', 'true');
    vi.stubEnv('BACKEND_TABLE_NAME', 'test-table'); vi.stubEnv('TUTOR_QUEUE_URL', 'test-queue');
    for (const mock of Object.values(fake)) mock.mockReset();
    fake.reserve.mockResolvedValue(undefined); fake.release.mockResolvedValue(undefined);
    fake.enqueue.mockResolvedValue({ jobId: 'ignored' });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('keeps question and page context separate and derives identity/policy on the server', async () => {
    const response = await post({ question: ' 決定木とは？ ', readerContext, requestedAction: 'explanation',
      userId: 'attacker', organizationId: 'other', context: { mode: 'assessment', allowAnswer: true } });
    expect(response.status).toBe(202);
    expect(fake.enqueue).toHaveBeenCalledTimes(1);
    const input = fake.enqueue.mock.calls[0][0];
    expect(input.question).toBe('決定木とは？');
    expect(input.readerContext).toEqual(readerContext);
    expect(input.userId).toBe('user-001');
    expect(input.context).toMatchObject({ organizationId: 'school-001', mode: 'learning', assistancePolicy: 'guided', allowAnswer: false });
    expect(fake.reserve.mock.invocationCallOrder[0]).toBeLessThan(fake.enqueue.mock.invocationCallOrder[0]);
  });
  it('accepts older requests that omit the optional reader context', async () => {
    expect((await post({ question: '決定木とは？', requestedAction: 'explanation' })).status).toBe(202);
  });
  it.each([
    { ...readerContext, filename: '../private.pdf' }, { ...readerContext, filename: '01_chapter1.pdf' },
    { ...readerContext, page: 0 }, { ...readerContext, text: 'x'.repeat(4001) },
  ])('rejects invalid or other-chapter page context before quota/SQS: %j', async reader => {
    const response = await post({ question: '質問', requestedAction: 'explanation', readerContext: reader });
    expect(response.status).toBe(422);
    expect(fake.reserve).not.toHaveBeenCalled(); expect(fake.enqueue).not.toHaveBeenCalled();
  });
  it('keeps disabled AI closed, and still requires authentication when enabled', async () => {
    vi.stubEnv('TEXTBOOK_AI_ENABLED', 'false');
    expect((await post({ question: '質問', requestedAction: 'explanation', readerContext })).status).toBe(503);
    vi.stubEnv('TEXTBOOK_AI_ENABLED', 'true');
    expect((await request(app).post('/api/v1/materials/ii-3/questions').send({ question: '質問' })).status).toBe(401);
    expect(fake.enqueue).not.toHaveBeenCalled();
  });
  it('enforces the daily/concurrent gate before dispatch and releases after dispatch failures', async () => {
    fake.reserve.mockRejectedValueOnce(Object.assign(new Error(), { name: 'ConditionalCheckFailedException' }));
    expect((await post({ question: '質問', requestedAction: 'explanation' })).status).toBe(429);
    expect(fake.enqueue).not.toHaveBeenCalled();
    fake.enqueue.mockRejectedValueOnce(new Error('sensitive'));
    const response = await post({ question: '質問', requestedAction: 'explanation' });
    expect(response.status).toBe(503); expect(JSON.stringify(response.body)).not.toContain('sensitive');
    expect(fake.release).toHaveBeenCalledTimes(1);
  });
  it('passes the same context through SQS, worker and owner-bound job polling', async () => {
    const store = new InMemoryTutorJobStore();
    const send = vi.fn().mockResolvedValue({});
    const provider = new SqsAiTutorProvider('queue', store, { send } as never);
    fake.enqueue.mockImplementation(input => provider.enqueue(input));
    const accepted = await post({ question: '決定木とは？', readerContext, requestedAction: 'explanation' });
    expect(accepted.status).toBe(202);
    const command = send.mock.calls[0][0].input;
    const message = tutorJobMessageSchema.parse(JSON.parse(command.MessageBody));
    expect(message.readerContext).toEqual(readerContext);
    expect(command.MessageDeduplicationId).toBe(accepted.body.jobId);
    const answer = vi.fn().mockResolvedValue({ status: 'SUPPORTED', responseType: 'EXPLANATION', message: '教材に基づく説明',
      citations: ['03_chapter3_part2.pdf / PDF 1ページ'], model: 'amazon.nova-pro-v1:0' });
    expect(await handleEvent({ Records: [{ messageId: 'm', body: command.MessageBody }] }, { tutor: { answer }, store })).toEqual({ batchItemFailures: [] });
    expect(answer.mock.calls[0][0]).toMatchObject({ question: '決定木とは？', readerContext });
    const owner = { userId: message.userId, organizationId: message.organizationId };
    expect((await provider.getJob(message.jobId, owner)).status).toBe('COMPLETED');
    expect((await provider.getJob(message.jobId, { ...owner, userId: 'other' })).status).toBe('UNAVAILABLE');
    expect((await provider.getJob(message.jobId, { ...owner, organizationId: 'other' })).status).toBe('UNAVAILABLE');
  });
});
