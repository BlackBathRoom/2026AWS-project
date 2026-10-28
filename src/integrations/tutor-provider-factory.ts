import { AiTutorProvider } from './ai-provider';
import { SqsAiTutorProvider } from './aws-ai-provider';
import { DynamoTutorJobStore } from '../repositories/tutor-job-store';

let cached: AiTutorProvider | null | undefined;

export function resolveTutorProvider(
  env: NodeJS.ProcessEnv = process.env
): AiTutorProvider | null {
  if (cached !== undefined) return cached;

  const queueUrl = env.TUTOR_QUEUE_URL;
  const tableName = env.BACKEND_TABLE_NAME;

  if (!queueUrl || !tableName) {
    cached = null;
    return cached;
  }

  cached = new SqsAiTutorProvider(
    queueUrl,
    new DynamoTutorJobStore(tableName)
  );
  return cached;
}

export function resetTutorProvider(): void {
  cached = undefined;
}