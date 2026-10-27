# 情報II AI学習システム

情報IIの学習・診断・AI支援を行うWebアプリケーションです。フロントエンド(担当A)、バックエンドAPI(担当B)、AI/RAG(担当C)で分担します。共通API契約(OpenAPI)、TypeScriptバックエンド、CDKによるAWS構成、契約テストを含みます。

## 担当ごとの使用言語・構成（重要）

リポジトリ全体で構成がぶつからないよう、担当ごとに言語と配置を固定します。**この指定から外れる構成追加(例: バックエンドを別言語で書き直す、`package.json`を自分の担当都合で全面置換する)は行わないでください。**

| 担当 | 役割 | 使用言語 / ランタイム | 配置 | ビルド |
|---|---|---|---|---|
| **担当A** | フロントエンド(UI・アクセシビリティ) | **素のJavaScript(ESモジュール)** + HTML/CSS。ビルド・バンドラ・TSは使わない | `public/` 配下のみ | なし(ブラウザが直接読む) |
| **担当B** | バックエンドAPI・認証・採点・到達判定・AWS基盤 | **TypeScript**(Express) + **AWS CDK(TypeScript)**。AWS SDK は **v3** | `src/`(CDKは`cdk/`) | `tsc`(`npm run build`) |
| **担当C** | 教材限定RAG・AI回答生成 | **TypeScript**。Bedrock / SQS / Lambda(AWS SDK **v3**) | `src/integrations/bedrock-*`, `src/ai-worker.ts`, `src/integrations/rag-governance.ts` 等 | 担当Bと同じ`tsc` |

### 共通ルール(構成の衝突を防ぐため)

- **`package.json` / `package-lock.json` はルートの1つを全担当で共有**します。依存を追加するときは**追記のみ**とし、既存の `scripts` や依存を削除・置換しないでください。
- **バックエンドとCDKはTypeScript、AWS SDKはv3で統一**します。`aws-sdk`(v2) は追加しないでください。
- **フロント(担当A)はビルドレスの素のJS**で、`public/` 配下だけを変更します。バックエンド(`src/*.ts`)やそのモックで上書きしないでください。
- 言語選択そのものは仕様書に指定がありません。上記はチームで決めた統一方針です。**変更したい場合は全担当合意のうえでこの表を更新**してください。

> 背景: 過去にフロント側PRが `package.json` をJS/aws-sdk v2構成へ全面置換し、仕様書準拠のTSバックエンド(AI制御・AWS・認証・監査)がモックで失われる衝突が発生しました。上記ルールはその再発防止です。

## フォルダ構成

```text
openapi/              OpenAPI 3.0.3契約
public/               担当A フロントエンド(JS/HTML/CSS)
src/                  担当B/C バックエンド(TypeScript)
  contracts/          ブランド付きID、認証、学習コンテキスト、型
  routes/             APIルート
  services/           業務ロジック
  repositories/       InMemory / DynamoDB リポジトリ
  integrations/       外部接続(Cognito/S3/SQS/CloudWatch/Bedrock)
  middleware/         認証ミドルウェア
  mocks/              サンプルデータ
  ai-worker.ts        担当C AI worker Lambda(SQS駆動のBedrock RAG)
cdk/                  AWS CDK(TypeScript): BackendStack / TutorAiStack
tests/                Vitest契約・サービステスト
frontversion/         担当A引継ぎ資料
docs/                 APIルール、A/C連携、AWS構成、デプロイ手順、未確定事項
```

## 必要なソフトウェア

- Node.js LTS
- npm

## インストールと起動

```bash
npm install
npm run build
npm run dev
```

ポートは `3000`(`PORT`で変更可能)です。本番環境ではモックトークンを受け付けません。

AWS構成テンプレートのローカル検証(デプロイはしません):

```bash
npm run cdk:synth
```

## フロントエンド(UI)の確認

`public/` に担当AのフロントエンドUIが含まれます。`npm run dev` でバックエンドと同一オリジンで配信され、ブラウザで `http://localhost:3000/index.html` を開くと確認できます。

フロントは `/runtime-config.js`(サーバーが提供) の `window.RUNTIME_CONFIG` を読み、`api_base`/`mode`/`upload_origins` を決定します。既定はローカル確認用に `mode=mock`、`api_base=/api/v1` です。デプロイ環境では以下の環境変数で差し替えます。

- `FRONTEND_MODE`: `mock` または実API接続時の値
- `FRONTEND_API_BASE`: API Gatewayのベース(例 `https://xxxx.execute-api.us-east-1.amazonaws.com/prod/api/v1`)
- `FRONTEND_UPLOAD_ORIGINS`: 署名URLアップロード先の許可オリジン(カンマ区切り)

本番の静的配信は S3/CloudFront 等を想定しており、Expressの静的配信はローカル確認用です。

## テスト実行

```bash
npm test
```

## APIの確認方法

```bash
curl http://localhost:3000/api/v1/health
curl -H 'Authorization: Bearer mock-user-001' http://localhost:3000/api/v1/me
curl -H 'Authorization: Bearer mock-user-001' 'http://localhost:3000/api/v1/trainings'
curl -H 'Authorization: Bearer mock-user-001' 'http://localhost:3000/api/v1/study-context?trainingId=training-001&assignmentId=assignment-001'
```

モックユーザーは `mock-user-001`(school-001学生)、`mock-user-002`(school-002学生)、`mock-user-003`(school-001教員)です。認証情報はサーバー側のユーザー情報から決まり、リクエストの組織・役割・modeは信頼しません。

## OpenAPIの確認方法

契約は [openapi/openapi.yaml](openapi/openapi.yaml) です。`npm test` でYAML構文とOpenAPI 3.0スキーマ、正常レスポンスのスキーマ整合性を検証します。

## 担当別の注意点

### 担当A(フロント)

- API のベースURLは `/api/v1`、日時はUTCのISO 8601、エラーは共通形式です。認証済み呼び出しには Cognito の Bearer トークンを付けます。
- 実装は `public/` 配下の素のJSのみ。`src/` のTypeScriptやそのモックには手を入れないでください。
- フロント↔バックエンドの**フィールド命名・ジョブ状態名には差異**があり(フロント snake_case/`SUCCEEDED`・`TIMEOUT`、バック camelCase/`COMPLETED`・`FAILED`)、最終的なすり合わせは担当A/B/Cの合意事項です。`frontversion/` の引継ぎ資料を参照してください。
- 詳細は [docs/frontend-integration.md](docs/frontend-integration.md)。

### 担当B(バックエンド)

- 実装は TypeScript(`src/`)、インフラは CDK(`cdk/`)。AWS SDK は v3。
- 組織境界はIDを受け取るだけでなく認証コンテキストと現在の所属を照合します。確定提出・確定評価は上書きせず、`expectedVersion` と `Idempotency-Key` で競合・二重処理を防ぎます。
- AWS移行境界は [docs/backend-architecture.md](docs/backend-architecture.md)、仕様比較は [docs/backend-gap-analysis.md](docs/backend-gap-analysis.md)、未確定事項は [docs/pending-decisions.md](docs/pending-decisions.md)。

### 担当C(AI/RAG)

- 実装は TypeScript。接続点は `src/integrations/ai-provider.ts` の `AiTutorProvider`。本番は SQS→AI worker(`src/ai-worker.ts`)→Bedrock Knowledge Base の経路です。
- `src/contracts/study-context.ts` の `StudyContext` に従います。`mode`・`assistancePolicy`・`ruleVersionId` はサーバー管理値で、クライアント入力では変更できません。評価モードでは正答や直接解答を返しません。
- 教材限定RAG・根拠充足判定・出典必須などのガバナンスは [docs/ai-integration.md](docs/ai-integration.md) と [docs/aws-ai-services.md](docs/aws-ai-services.md)。

## AWSデプロイ (担当B領域 / us-east-1)

担当B領域のリソースを `us-east-1` にCLIで作成する手順は [docs/deploy-backend.md](docs/deploy-backend.md) にあります。`Information2BackendStack` のみをデプロイし、担当C領域(SQS/Bedrock)の `Information2TutorAiStack` は含みません。

```bash
npm run cdk:deploy:backend   # = cdk deploy Information2BackendStack
```

Bedrock/RAG(担当C領域)の実装概要は [docs/aws-ai-services.md](docs/aws-ai-services.md) を参照してください。
