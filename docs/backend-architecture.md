# 担当Bローカル実装とAWS移行境界

## 現在のローカル実装

- Express Controller: `src/routes`
- Service: `src/services/backend-services.ts`
- InMemory Repository: `src/repositories/backend-repository.ts`
- 共通契約: `src/contracts`
- 外部接続インターフェース: `src/integrations`
- 自動テスト: `tests`

InMemory実装は、採点・版競合・冪等キー・削除状態・利用枠のローカル検証用です。AWSの実データを読み書きしません。

## AWSへ差し替える箇所

- `CognitoJwtAuthenticationProvider`: JWKS署名、issuer、exp、access-token用途、client_idを検証
- `requireBackendAuth`: 本番でJWT検証後、DynamoDBから現在のUser/Membershipを再取得
- `S3StorageProvider`: 非公開オブジェクトの短期PUT/GET署名URLと削除
- `SqsAiTutorProvider`: FIFO SQS受付アダプター。生成workerは担当C
- `CloudWatchAuditLogger`: 構造化監査イベント送信
- `DynamoEntityRepository`: get/put/query(cursor)/conditionalUpdate/delete
- `src/lambda.ts`: API Gateway/Lambda実行入口
- `cdk/src/backend-stack.ts`(担当B): Cognito、Regional API Gateway、Lambda、DynamoDB PITR、非公開Versioned S3、CloudWatch LogsのIaC
- `cdk/src/tutor-ai-stack.ts`(担当C): SQS FIFO/DLQ、AI worker Lambda、Bedrock/KB向けIAM、AI監査LogGroup

CDKはNode.js 24 Lambda runtimeを指定し、esbuildでLambdaコードと依存をバンドルします。`npm run cdk:synth`でテンプレート生成まで確認できます。

## スタック分離とデプロイ境界

CDKは責務境界に沿って2スタックに分離しています。リージョンは `us-east-1` 固定です。

- `Information2BackendStack` (担当B): 上記B領域リソース。単独でデプロイ可能。
- `Information2TutorAiStack` (担当C): SQS/DLQ/AI worker/Bedrock。BのDynamoDBテーブルを参照。

担当Bは `npm run cdk:deploy:backend` (= `cdk deploy Information2BackendStack`) でC領域に
一切触れずデプロイできます。両スタックは SQS キューの決定論的な名前を共有することで
相互の循環依存を避けています。CLI手順の詳細は `docs/deploy-backend.md` を参照してください。

AWS API Gateway、Lambda、Cognito、DynamoDB、S3、CloudWatchの実リソース作成・デプロイは対象外です。CDKコードとsynth検証までは完了しています。WAF、KMS、SQS、EventBridge、Budgets、ファイル実体/ウイルス検査workerのIaCは未作成です。

現行の業務Service群はローカルInMemory Repositoryを利用します。AWS用DynamoDBアダプターは実装済みですが、全業務エンティティへの永続化配線・移行は未完了です。本番APIを有効化する前に業務RepositoryをDynamoDBへ切り替える必要があります。S3署名URLプロバイダーも作成済みですが、提出APIの永続化・検査workflowへの注入は未完了です。

## 重要な保護

- 組織境界はIDを受け取るだけでなく、認証コンテキストと現在の所属を照合する
- 確定提出・確定評価は直接上書きしない
- `expectedVersion` で競合を検出する
- `Idempotency-Key` で二重保存・二重加算を防止する
- 削除台帳は復旧時に再適用する
- 生の質問、個人情報、正答を通常ログへ出さない
