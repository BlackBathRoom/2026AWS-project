import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { StudyContext } from '../contracts/study-context';
import { AiTutorProvider } from './ai-provider';

export class SqsAiTutorProvider implements AiTutorProvider {
  constructor(private readonly queueUrl: string, private readonly sqs = new SQSClient({})) {}

  async enqueue(input: { userId: string; question: string; context: StudyContext; requestedAction: string }) {
    const jobId = `job-${crypto.randomUUID()}`;
    await this.sqs.send(new SendMessageCommand({ QueueUrl: this.queueUrl, MessageDeduplicationId: jobId, MessageGroupId: input.userId, MessageBody: JSON.stringify({ jobId, ...input }) }));
    return { jobId };
  }

  async getJob(jobId: string) { return { status: 'QUEUED' as const, result: { status: 'UNAVAILABLE' as const, reasonCode: `worker-pending:${jobId}` } }; }
}