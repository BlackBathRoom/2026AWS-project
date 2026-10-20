// 担当C領域の AI worker Lambda。SQS(FIFO) からチュータージョブを受信し、
// Bedrock 教材限定 RAG で回答を生成して、ジョブ状態を永続化・監査ログ出力する。
//
// 処理フロー(仕様書 自動出題フロー STEP6 / AIガバナンス G-002〜G-005, G-008):
//   1. メッセージ検証
//   2. ジョブを RUNNING に遷移
//   3. Bedrock KB 検索 + 根拠充足判定 + response_type 決定 + 生成
//   4. 結果を COMPLETED/FAILED で永続化
//   5. AI監査ログ(質問・根拠・回答タイプ・モデル・時刻)を記録
//
// SQS 部分バッチ失敗レポートを返し、失敗メッセージのみ再処理/DLQ 行きにする。

import { BedrockRagTutor, bedrockConfigFromEnv } from './integrations/bedrock-ai-provider';
import { CloudWatchAuditLogger, type AuditLogger } from './integrations/cloudwatch-audit-logger';
import { DynamoTutorJobStore, type TutorJobStore } from './repositories/tutor-job-store';
import { tutorJobMessageSchema, type TutorJobMessage, type SQSBatchResponse, type SQSEvent, type SQSRecord } from './integrations/tutor-message';
import { guidanceMessage } from './integrations/rag-governance';
import type { AuditEvent, AuditEventId, TutorResult } from './contracts/backend';
import type { OrganizationId, UserId } from './contracts/common';

interface WorkerDeps {
  tutor: Pick<BedrockRagTutor, 'answer'>;
  store: TutorJobStore;
  audit?: AuditLogger;
}

let cachedDeps: WorkerDeps | undefined;

function buildDeps(): WorkerDeps {
  const tableName = process.env.BACKEND_TABLE_NAME;
  if (!tableName) throw new Error('BACKEND_TABLE_NAME is required');
  const tutor = new BedrockRagTutor(bedrockConfigFromEnv());
  const store = new DynamoTutorJobStore(tableName);
  const audit =
    process.env.AI_AUDIT_LOG_GROUP && process.env.AI_AUDIT_LOG_STREAM
      ? new CloudWatchAuditLogger(process.env.AI_AUDIT_LOG_GROUP, process.env.AI_AUDIT_LOG_STREAM)
      : undefined;
  return { tutor, store, audit };
}

async function writeAudit(deps: WorkerDeps, message: TutorJobMessage, result: TutorResult): Promise<void> {
  if (!deps.audit) return;
  const event: AuditEvent = {
    eventId: `audit-${message.jobId}` as AuditEventId,
    organizationId: message.organizationId as OrganizationId,
    actorId: message.userId as UserId,
    action: `ai.tutor.${message.requestedAction}:${result.responseType ?? result.status}`,
    targetType: 'AIInteraction',
    targetId: message.jobId,
    result: result.status === 'SUPPORTED' ? 'allowed' : 'denied',
    occurredAt: new Date().toISOString(),
  };
  await deps.audit.write(event).catch(() => undefined);
}

/** 1メッセージを処理する。失敗時は例外を投げ、呼び出し側で部分バッチ失敗として扱う。 */
export async function processRecord(record: SQSRecord, deps: WorkerDeps): Promise<void> {
  const parsed = tutorJobMessageSchema.safeParse(JSON.parse(record.body));
  if (!parsed.success) {
    // 不正メッセージは再処理しても直らないため DLQ に送らず握りつぶす (ログは監査基盤側)。
    return;
  }
  const message = parsed.data as TutorJobMessage;

  await deps.store.markRunning(message.jobId);

  try {
    const generated = await deps.tutor.answer({
      question: message.question,
      context: message.context,
      requestedAction: message.requestedAction,
    });
    const result: TutorResult = {
      status: generated.status,
      responseType: generated.responseType,
      message: generated.message,
      citations: generated.citations,
      model: generated.model,
      reasonCode: generated.reasonCode,
    };
    await deps.store.complete(message.jobId, result);
    await writeAudit(deps, message, result);
  } catch (error) {
    const result: TutorResult = {
      status: 'ERROR',
      responseType: 'NO_ANSWER',
      message: guidanceMessage('ERROR'),
      reasonCode: error instanceof Error ? error.name : 'unknown-error',
    };
    await deps.store.fail(message.jobId, result);
    await writeAudit(deps, message, result);
    // Bedrock の一時障害などは再試行させるため再スロー。
    throw error;
  }
}

/** SQS イベントハンドラ本体。テスト用に deps を注入できる。 */
export async function handleEvent(event: SQSEvent, deps: WorkerDeps): Promise<SQSBatchResponse> {
  const batchItemFailures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) {
    try {
      await processRecord(record, deps);
    } catch {
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  cachedDeps ??= buildDeps();
  return handleEvent(event, cachedDeps);
};
