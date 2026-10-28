// 環境変数に応じて AI チュータープロバイダーを選択する。
// AWS 環境 (TUTOR_QUEUE_URL + BACKEND_TABLE_NAME が設定済み) では SQS→Bedrock worker 構成を使い、
// ローカル/テストでは未設定として null を返し、ルート層が既存のインメモリ挙動へフォールバックする。

import { AiTutorProvider } from './ai-provider';
import { SqsAiTutorProvider } from './aws-ai-provider';
import { DynamoTutorJobStore } from '../repositories/tutor-job-store';

let cached: AiTutorProvider | null | undefined;

export function resolveTutorProvider(env: NodeJS.ProcessEnv = process.env): AiTutorProvider | null {
  if (cached !== undefined) return cached;
  const queueUrl = env.TUTOR_QUEUE_URL;
  const tableName = env.BACKEND_TABLE_NAME;
  if (!queueUrl || !tableName) {
    cached = null;
    return cached;
  }
  cached = new SqsAiTutorProvider(queueUrl, new DynamoTutorJobStore(tableName));
  return cached;
}

/** テスト用: キャッシュをリセットする。 */
export function resetTutorProvider(): void {
  cached = undefined;
}
