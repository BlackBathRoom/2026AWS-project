import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { InternalStudyContext } from '../contracts/study-context';
import { AiTutorProvider } from './ai-provider';
import { RequestedAction } from './rag-governance';
import { TutorJobMessage } from './tutor-message';
import { TutorJobStore } from '../repositories/tutor-job-store';

// B が認可・利用枠ゲートを通過したジョブを SQS(FIFO) へ投入する。実際の生成は AI worker(src/ai-worker.ts) が行う。
// ジョブ状態は TutorJobStore で永続化し、getJob はストアから読む。
export class SqsAiTutorProvider implements AiTutorProvider {
  constructor(
    private readonly queueUrl: string,
    private readonly store: TutorJobStore,
    private readonly sqs = new SQSClient({}),
  ) {}

  async enqueue(input: {
    jobId?: string;
    userId: string;
    question: string;
    context: InternalStudyContext;
    requestedAction: string;
  }) {
    const jobId = input.jobId ?? `job-${crypto.randomUUID()}`;
    await this.store.create({
      jobId,
      userId: input.context.userId,
      organizationId: input.context.organizationId,
      status: 'QUEUED',
    });
    const message: TutorJobMessage = {
      jobId,
      userId: input.userId,
      organizationId: input.context.organizationId,
      question: input.question,
      requestedAction: input.requestedAction as RequestedAction,
      context: input.context,
    };
    await this.sqs.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageDeduplicationId: jobId,
        MessageGroupId: input.userId,
        MessageBody: JSON.stringify(message),
      }),
    );
    return { jobId };
  }

  async getJob(jobId: string, owner?: { userId: string; organizationId: string }) {
    if (!owner) return { status: 'UNAVAILABLE' as const };
    const job = await this.store.get(jobId, owner);
    if (!job) return { status: 'UNAVAILABLE' as const };
    return { status: job.status, result: job.result };
  }
}
