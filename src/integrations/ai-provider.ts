import { StudyContext } from '../contracts/study-context';

export interface AiTutorProvider {
  enqueue(input: { userId: string; question: string; context: StudyContext; requestedAction: string }): Promise<{ jobId: string }>;
  getJob(jobId: string): Promise<{ status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'UNAVAILABLE'; result?: unknown }>;
}

// C-owned implementation: SQS/Lambda/Bedrock/Knowledge Bases. B owns authorization and quota gates.