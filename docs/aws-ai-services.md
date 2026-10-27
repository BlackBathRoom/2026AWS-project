# AWSサービス活用: 教材限定RAG AIチューター (Lambda + Bedrock)

仕様書の「AIガバナンス・回答制御仕様」「状態/response_type」「自動出題フロー STEP6(AI支援)」「主要データ・ログ設計(AIInteraction/AIRetrievalLog)」に対応する、Bedrock を用いた教材限定 RAG の実装一覧です。

## 構成

```
受講者 → API Gateway(Cognito認証)
  → Backend Lambda(担当B: 認可・利用枠・援助ポリシー・InternalStudyContext生成)
    → SQS(FIFO) + DLQ
      → AI worker Lambda(担当C: src/ai-worker.ts)
        → Bedrock Knowledge Base Retrieve(承認済み教材KB限定)
        → 根拠充足判定 / response_type決定(src/integrations/rag-governance.ts)
        → Bedrock Converse(教材根拠のみで生成)
        → TutorJobStore(DynamoDB)へ状態保存
        → AI監査ログ(CloudWatch Logs)
受講者 → GET /tutor/jobs/:id で結果をポーリング(所有者境界付き)
```

## 実装ファイル

| ファイル | 役割 | 対応仕様 |
|---|---|---|
| `src/integrations/rag-governance.ts` | 根拠充足判定・response_type制御・出典整形(プロバイダー非依存の純粋ロジック) | G-002, G-003, G-004, G-005, F-010, F-011 |
| `src/integrations/bedrock-ai-provider.ts` | Bedrock KB検索(Retrieve)+ Converse生成。教材根拠のみで回答 | G-001, F-008 |
| `src/ai-worker.ts` | SQS→Bedrock→永続化→監査。部分バッチ失敗対応 | STEP6, G-008 |
| `src/repositories/tutor-job-store.ts` | TutorJob状態の DynamoDB 永続化(所有者境界) | AIInteraction |
| `src/integrations/aws-ai-provider.ts` | B受付APIからSQSへ投入する`SqsAiTutorProvider` | AI利用可否ゲート後の委譲 |
| `src/integrations/tutor-message.ts` | B→worker間のジョブメッセージ契約(zod検証) | StudyContext受渡し |
| `cdk/src/backend-stack.ts` | SQS FIFO + DLQ、worker Lambda、Bedrock/KB IAM、監査LogGroup | AWSリソース |

## ガバナンスの要点

- **教材限定 (G-001)**: Knowledge Base ID を承認済み教材データセットに固定。worker の IAM は当該 KB の `bedrock:Retrieve` のみ許可。
- **根拠充足判定 (G-002)**: 取得チャンクのスコアと件数で `SUPPORTED / INSUFFICIENT / OUT_OF_SCOPE` を決定。閾値は環境変数で調整可能。
- **範囲外制御 (G-004)**: 根拠不足・範囲外では本文を一切生成せず `NO_ANSWER` の案内文のみ返す。
- **response_type構造化 (G-003)**: 評価モードでは `ANSWER` を禁止し `HINT` に降格。`allowAnswer=false` も降格。
- **出典必須 (G-005)**: `SUPPORTED` で本文を返す際は教材ID/章/学習/ページの引用を必須。空生成・出典欠落時は安全側で `INSUFFICIENT` に転換。
- **監査 (G-008)**: 質問・response_type・モデル・時刻・判定結果を CloudWatch Logs に記録。

## デプロイ時に差し替える値

CDK は以下を環境変数から読み、未設定時はプレースホルダを使います(担当Cが作成する承認済み教材KBに合わせる)。

- `BEDROCK_KNOWLEDGE_BASE_ID`: 承認済み教材の Knowledge Base ID
- `BEDROCK_MODEL_ID`: 生成に使う基盤モデル ID(既定: Claude 3.5 Sonnet)

## 動作モード

- **AWS構成**: `TUTOR_QUEUE_URL` と `BACKEND_TABLE_NAME` が設定されると、`POST /tutor/jobs` が SQS へ投入し、`GET /tutor/jobs/:id` が DynamoDB の永続ジョブを所有者境界付きで返す。
- **ローカル/テスト**: 上記未設定時は既存のインメモリ挙動にフォールバックし、外部AWS接続なしで開発・テストできる。

## 検証

```text
TypeScript build: 成功
Vitest: 59 tests passed / 0 failed (うちBedrock/ガバナンス/worker 16件)
CDK synth: 成功(SQS FIFO + DLQ + worker Lambda + Bedrock IAM)
```
