# 担当B 領域 AWSデプロイ手順 (CLI / us-east-1)

担当B領域のリソースを `us-east-1` に CLI で作成する手順です。CDK を使って
`Information2BackendStack` だけをデプロイします。担当C領域(SQS/DLQ/AI worker/Bedrock)の
`Information2TutorAiStack` はこの手順には含めません。

## 作成されるリソース (担当B領域のみ)

| リソース | 用途 |
|---|---|
| Cognito User Pool + App Client | 利用者認証 (JWT発行元) |
| API Gateway (REST, Regional) | `/api/v1` 入口、Cognitoオーソライザー |
| Lambda (BackendHandler, Node.js 24) | Express受付API |
| DynamoDB Table (pk/sk, PITR有効) | 業務データ永続化 |
| S3 Bucket (非公開, 暗号化, バージョニング) | 提出ファイル保管 |
| CloudWatch Logs (1年保持) | APIアクセスログ |
| IAM Role/Policy | 上記への最小権限 |

> 注: Lambda には将来 C 領域のSQSへ送るための送信権限と `TUTOR_QUEUE_URL` 環境変数が
> 付与されますが、SQSキュー本体は作成されません。TutorAiStack 未デプロイの間、受付APIは
> ローカル同様インメモリ挙動にフォールバックします。

## 前提

- AWS アカウントと、`us-east-1` にデプロイ可能な IAM 権限を持つ認証情報
- Node.js LTS / npm
- AWS CLI v2 (認証確認に使用)

## 手順

### 1. 認証情報を設定する

```bash
# いずれかの方法で us-east-1 の認証情報を用意する
aws configure            # あるいは
export AWS_PROFILE=your-profile
export AWS_REGION=us-east-1

# 認証とアカウントを確認
aws sts get-caller-identity
```

リージョンは CDK 側で `us-east-1` に固定済みです。`AWS_REGION` が別値でも
デプロイ先は `us-east-1` になります。

### 2. 依存をインストールする

```bash
# リポジトリ直下
npm install

# CDK ディレクトリ
cd cdk && npm install && cd ..
```

### 3. CDK をブートストラップする (アカウント×リージョンごとに初回のみ)

```bash
# アカウントIDは手順1の get-caller-identity の Account 値
npx --prefix cdk cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
```

CDK ディレクトリで直接実行する場合:

```bash
cd cdk
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
cd ..
```

### 4. 差分を確認する (任意だが推奨)

```bash
cd cdk
npm run -s build
npx cdk diff Information2BackendStack
cd ..
```

### 5. 担当Bスタックだけをデプロイする

```bash
# リポジトリ直下から一発で
npm run cdk:deploy:backend

# もしくは CDK ディレクトリで明示的に
cd cdk
npm run -s build
npx cdk deploy Information2BackendStack
cd ..
```

スタック名を明示しているため、`Information2TutorAiStack` (担当C領域) はデプロイされません。

### 6. 出力値を控える

デプロイ完了時に以下が出力されます。担当A(フロント)・担当Cへ共有してください。

- `ApiUrl` — API Gateway のベースURL
- `UserPoolId` — Cognito User Pool ID
- `UserPoolClientId` — App Client ID (トークンの audience / client_id)
- `TableName` — DynamoDB テーブル名
- `BucketName` — S3 バケット名

後から確認する場合:

```bash
aws cloudformation describe-stacks \
  --stack-name Information2BackendStack \
  --region us-east-1 \
  --query 'Stacks[0].Outputs' --output table
```

## デプロイ後の確認

### ヘルスチェック (認証不要)

```bash
curl "<ApiUrl>health"
```

### 認証ありエンドポイント

本番は Cognito 発行の JWT が必要です。利用者を作成しアクセストークンを取得します。

```bash
# 管理者が利用者を作成 (self sign-up は無効)
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> \
  --username student01 \
  --region us-east-1

# 恒久パスワードを設定
aws cognito-idp admin-set-user-password \
  --user-pool-id <UserPoolId> \
  --username student01 \
  --password '<Passw0rd!>' --permanent \
  --region us-east-1

# 認証してアクセストークンを取得 (USER_PASSWORD_AUTH を使う場合は App Client で有効化が必要)
aws cognito-idp initiate-auth \
  --client-id <UserPoolClientId> \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=student01,PASSWORD='<Passw0rd!>' \
  --region us-east-1
```

> 本番の `requireBackendAuth` は JWT を検証後、DynamoDB の User/Membership を再取得して
> 組織・役割・所属を確定します。利用者の組織や役割は Cognito のカスタム属性
> (`custom:organizationId` / `custom:role` / `custom:trainingIds`) と DynamoDB 側の
> レコードで整合させてください。

取得したトークンで呼び出す:

```bash
curl -H "Authorization: Bearer <AccessToken>" "<ApiUrl>api/v1/me"
```

## 更新と削除

```bash
# 再デプロイ (差分のみ適用)
npm run cdk:deploy:backend

# スタック削除
cd cdk
npx cdk destroy Information2BackendStack
cd ..
```

> データ保護のため DynamoDB / S3 / Cognito / Logs は `RemovalPolicy.RETAIN` です。
> `cdk destroy` してもこれらは残ります。不要になったら各リソースを手動削除してください
> (S3 はオブジェクトを空にしてからバケット削除)。

## トラブルシュート

- **`This stack uses assets, so the toolkit stack must be deployed`**: 手順3のブートストラップ未実施。`cdk bootstrap` を実行する。
- **`Unable to resolve AWS account`**: 認証情報が未設定。手順1を実施する。
- **デプロイ先が us-east-1 にならない**: `cdk/src/app.ts` で region は `us-east-1` 固定。
  `cdk.Environment` を上書きしていないか確認する。
- **Cognito `initiate-auth` が失敗する**: 既定の App Client は `userSrp` 認証フロー。
  `USER_PASSWORD_AUTH` を使う場合は App Client の認証フローに追加する。
