import { InternalStudyContext } from '../contracts/study-context';
import { TutorResult } from '../contracts/backend';

export interface AiTutorProvider {
  enqueue(input: {
    jobId?: string;
    userId: string;
    question: string;
    context: InternalStudyContext;
    requestedAction: string;
  }): Promise<{ jobId: string }>;
  getJob(
    jobId: string,
    owner?: { userId: string; organizationId: string },
  ): Promise<{ status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'UNAVAILABLE'; result?: TutorResult }>;
}

// C-owned implementation: SQS/Lambda/Bedrock/Knowledge Bases (src/integrations/aws-ai-provider.ts, src/ai-worker.ts).
// B owns authorization and quota gates before enqueue.
