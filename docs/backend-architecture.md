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

- `AuthenticationProvider`: Cognito JWTの署名、issuer、audience、exp検証
- `StorageProvider`: 非公開S3、短期署名URL、ウイルス/実体検査連携
- `AiTutorProvider`: SQS/Lambda/Bedrock/Knowledge Bases連携
- `BackendRepository`: DynamoDBの条件付き更新、トランザクション、PITR
- `src/repositories/dynamo-repository.ts`: DynamoDBの取得・条件付き更新・削除
- `src/lambda.ts`: API Gateway/Lambda実行入口
- `cdk/src/backend-stack.ts`: Cognito、API Gateway、Lambda、DynamoDB、S3、CloudWatch LogsのIaC

AWS API Gateway、Lambda、Cognito、DynamoDB、S3、CloudWatchの実リソース作成・デプロイは対象外です。CDKコードとsynth検証までは完了しています。WAF、KMS、SQS、EventBridge、BudgetsのIaCは未作成です。

## 重要な保護

- 組織境界はIDを受け取るだけでなく、認証コンテキストと現在の所属を照合する
- 確定提出・確定評価は直接上書きしない
- `expectedVersion` で競合を検出する
- `Idempotency-Key` で二重保存・二重加算を防止する
- 削除台帳は復旧時に再適用する
- 生の質問、個人情報、正答を通常ログへ出さない
