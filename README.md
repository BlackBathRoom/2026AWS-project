# 情報II AI学習システム B-01

## システム概要

情報IIの学習・診断・AI支援を行うWebアプリケーションの共通API契約です。本リポジトリではAWSリソースを作成せず、OpenAPI、TypeScript型、認証付きExpressモック、契約テストを提供します。

## フォルダ構成

```text
openapi/  OpenAPI 3.0.3契約
src/contracts/  ブランド付きID、認証、学習コンテキスト
src/middleware/  ローカル専用モック認証
src/mocks/  ユーザー・研修・StudyContextのサンプル
src/routes/  サンプルAPIルート
tests/  Vitest契約テスト
docs/  APIルール、連携ガイド、未確定事項
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

ポートは `3000`（`PORT`で変更可能）です。本番環境ではモックトークンを受け付けません。

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

モックユーザーは `mock-user-001`（school-001学生）、`mock-user-002`（school-002学生）、`mock-user-003`（school-001教員）です。認証情報はサーバー側のユーザー情報から決まり、リクエストの組織・役割・modeは信頼しません。

## OpenAPIの確認方法

契約は [openapi/openapi.yaml](openapi/openapi.yaml) です。`npm test` でYAML構文とOpenAPI 3.0スキーマ、正常レスポンスのスキーマ整合性を検証します。

## 担当Aへの共有事項

APIのベースURLは `/api/v1`、日時はUTCのISO 8601、エラーは共通形式です。認証済みサンプルにはBearerトークンを付けてください。正式な画面API番号は `docs/pending-decisions.md` の確定後に更新します。

## 担当Cへの共有事項

`src/contracts/study-context.ts` の `StudyContext` を利用できます。`mode`、`assistancePolicy`、`ruleVersionId` はサーバー管理値で、クライアント入力による変更はできません。

## B-02以降の実装予定

B-02でCognito JWT検証と本番認証、続いてDB永続化・RBAC拡張・監査ログ・到達判定（B-10）へ移行します。未確定事項は [docs/pending-decisions.md](docs/pending-decisions.md) に記載しています。