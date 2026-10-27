# 2026AWS-project

情報Ⅱを担当する教員を支援するAI学習システムです。

Amazon Bedrock Knowledge Base と Amazon Nova Pro を利用し、固定された情報Ⅱ教材を根拠として質問に回答します。  
教材の範囲外の質問には `OUT_OF_SCOPE` を返します。

## 必要環境

- Node.js 22
- npm
- AWS CLI
- Amazon Bedrock を利用できるAWSアカウント

プロジェクトルートの `.nvmrc` には、次のNode.jsバージョンを指定しています。

```text
22
```

また、`package.json` ではNode.js 22系を要求しています。

```json
"engines": {
  "node": ">=22 <23"
}
```

nvmを使用する場合は、プロジェクトルートで次を実行してください。

```bash
nvm use
```

Node.jsのバージョン確認:

```bash
node -v
npm -v
```

## 依存パッケージのインストール

リポジトリをcloneした後、プロジェクトルートで次を実行します。

```bash
npm install
```

## AWS認証

ローカル開発では、AWS CLIの `aws login` を使用します。

```bash
aws login
```

WSLなど、ブラウザを直接開けない環境では次のように実行できます。

```bash
aws login --remote --region us-east-1
```

認証状態は次のコマンドで確認できます。

```bash
aws sts get-caller-identity
```

AWS Access Key、Secret Access Key、Session Tokenなどの認証情報は、コードやREADMEには記載しないでください。

## 必要な環境変数

APIサーバーを起動する際には、次の環境変数を設定します。

```text
AWS_USE_LOGIN_CREDENTIALS=true
AWS_PROFILE=default
AWS_REGION=us-east-1
BEDROCK_KNOWLEDGE_BASE_ID=<Knowledge Base ID>
BEDROCK_MODEL_ID=amazon.nova-pro-v1:0
```

### 環境変数の説明

| 環境変数 | 内容 |
|---|---|
| `AWS_USE_LOGIN_CREDENTIALS` | ローカル開発時に `aws login` の認証情報を使用するか |
| `AWS_PROFILE` | 使用するAWS CLIプロファイル |
| `AWS_REGION` | Amazon Bedrockを使用するリージョン |
| `BEDROCK_KNOWLEDGE_BASE_ID` | 使用するBedrock Knowledge BaseのID |
| `BEDROCK_MODEL_ID` | 回答生成・根拠判定に使用するBedrockモデル |

`BEDROCK_KNOWLEDGE_BASE_ID` には、実際に使用するKnowledge BaseのIDを設定してください。

READMEには実際のKnowledge Base IDやAWSアカウントIDなどの環境固有情報を記載しないでください。

## システム概要

このシステムでは、固定された情報Ⅱ教材だけを回答根拠として使用します。

処理の流れは次のとおりです。

```text
ユーザーの質問
    ↓
Amazon Bedrock Knowledge Base
    ↓
関連教材検索
    ↓
Amazon Nova Proによる根拠十分性判定
    ↓
supportingIndexesで回答根拠となる教材チャンクを選択
    ↓
Amazon Nova Proによる回答生成
    ↓
回答根拠となった教材からcitationsを生成
    ↓
APIレスポンス
```

Knowledge Baseが返した検索結果をすべて回答に使用するのではなく、Nova Proによる根拠十分性判定で、質問への回答に直接利用できる教材チャンクだけを選択します。

これにより、

- 質問と単語が似ているだけの教材
- 回答には直接必要のない教材
- 教材中に存在する単なる例示

などが回答根拠として使用されることを抑制します。

## 質問の判定

質問は主に次の3つの状態で判定します。

### `SUPPORTED`

固定教材から取得された1件または複数件の検索結果を利用することで、質問へ正確に回答できる場合です。

### `INSUFFICIENT`

質問自体は情報Ⅱや固定教材のテーマに含まれているものの、取得された検索結果だけでは正確に回答するための情報が不足している場合です。

### `OUT_OF_SCOPE`

固定教材だけでは回答できない質問です。

例:

- 現在の天気
- 現在のニュース
- 株価
- リアルタイム交通情報
- 地域固有の現在情報
- 店舗や飲食店のおすすめ
- 固定教材外の一般的な質問

教材の中に似た単語や例が存在していても、その内容が質問そのものへの回答根拠にならない場合は `OUT_OF_SCOPE` と判定します。

## APIサーバーの起動

Node.js 22を使用しているため、Node.js 18で必要だった次の設定は不要です。

```text
NODE_OPTIONS=--experimental-global-webcrypto
```

APIサーバーは次のように起動します。

```bash
AWS_USE_LOGIN_CREDENTIALS=true \
AWS_PROFILE=default \
AWS_REGION=us-east-1 \
BEDROCK_KNOWLEDGE_BASE_ID=<Knowledge Base ID> \
BEDROCK_MODEL_ID=amazon.nova-pro-v1:0 \
npm start
```

## API

### `POST /v1/tutor/ask`

情報Ⅱ教材について質問するためのAPIです。

### リクエスト例

```json
{
  "question": "決定木とはどのようなものですか？"
}
```

### `SUPPORTED` のレスポンス例

```json
{
  "status": "SUPPORTED",
  "answer": "教材を根拠とした回答",
  "citations": [
    {
      "fileName": "03_chapter3_part2.pdf",
      "s3Uri": "s3://...",
      "page": 1
    }
  ]
}
```

### `OUT_OF_SCOPE` のレスポンス例

```json
{
  "status": "OUT_OF_SCOPE",
  "answer": "固定教材の範囲内に回答の根拠が見つかりませんでした。",
  "citations": []
}
```

### `INSUFFICIENT` のレスポンス例

```json
{
  "status": "INSUFFICIENT",
  "answer": "関連する教材は見つかりましたが、回答するための十分な根拠がありませんでした。",
  "citations": []
}
```

## citations

`SUPPORTED` の場合、回答根拠として実際に選択された教材だけを `citations` として返します。

Knowledge Baseが検索したすべての教材をそのまま出典にするのではなく、`supportingIndexes` で回答根拠として選択された検索結果だけを使用します。

citationには次の情報を含みます。

```json
{
  "fileName": "03_chapter3_part2.pdf",
  "s3Uri": "s3://...",
  "page": 1
}
```

同じPDF・同じページが複数の検索結果として取得された場合は、重複を削除します。

## APIのテスト

APIサーバーを起動した状態で、別のターミナルから次を実行してください。

```bash
node scripts/testTutorApi.js
```

現在のテストでは、次の4問を順番にAPIへ送信します。

1. 決定木とはどのようなものですか？
2. 情報システムとはどのようなものですか？
3. 今日の京都の天気を教えてください。
4. おすすめのラーメン屋を教えてください。

期待される結果:

```text
決定木
→ SUPPORTED

情報システム
→ SUPPORTED

今日の京都の天気
→ OUT_OF_SCOPE

おすすめのラーメン屋
→ OUT_OF_SCOPE
```

教材内質問では、回答本文と回答根拠となったPDF・ページ情報が `citations` に含まれることを確認します。

教材外質問では、`OUT_OF_SCOPE` となり、`citations` が空配列になることを確認します。

## 個別テスト

Knowledge Base検索だけを確認する場合:

```bash
BEDROCK_KNOWLEDGE_BASE_ID=<Knowledge Base ID> \
AWS_REGION=us-east-1 \
node scripts/testBedrockRetrieval.js
```

根拠十分性判定を確認する場合:

```bash
AWS_USE_LOGIN_CREDENTIALS=true \
AWS_PROFILE=default \
BEDROCK_KNOWLEDGE_BASE_ID=<Knowledge Base ID> \
AWS_REGION=us-east-1 \
BEDROCK_MODEL_ID=amazon.nova-pro-v1:0 \
node scripts/testEvidenceService.js
```

AIサービス全体を確認する場合:

```bash
AWS_USE_LOGIN_CREDENTIALS=true \
AWS_PROFILE=default \
BEDROCK_KNOWLEDGE_BASE_ID=<Knowledge Base ID> \
AWS_REGION=us-east-1 \
BEDROCK_MODEL_ID=amazon.nova-pro-v1:0 \
node scripts/testAiServiceBedrock.js
```

## 主な構成

```text
src/
├── config/
│   └── awsClientConfig.js
│
├── data/
│   └── materials.json
│
├── services/
│   ├── aiService.js
│   ├── bedrockRetrievalService.js
│   ├── evidenceService.js
│   └── bedrockAnswerService.js
│
└── index.js

scripts/
├── testBedrockRetrieval.js
├── evaluateRetrieval.js
├── testEvidenceService.js
├── testBedrockAnswer.js
├── testAiServiceBedrock.js
└── testTutorApi.js
```

### 各サービスの役割

`bedrockRetrievalService.js`

- Amazon Bedrock Knowledge Baseから関連教材を検索します。

`evidenceService.js`

- 検索結果が質問への回答根拠として十分かをNova Proで判定します。
- `SUPPORTED`
- `INSUFFICIENT`
- `OUT_OF_SCOPE`
- `supportingIndexes`

を返します。

`bedrockAnswerService.js`

- `supportingIndexes` で選択された教材チャンクだけを根拠としてNova Proで回答を生成します。

`aiService.js`

- 教材検索
- 根拠十分性判定
- 回答生成
- citations生成

を統合します。

`index.js`

- Express APIを提供します。

## AWS認証について

ローカル開発では、`AWS_USE_LOGIN_CREDENTIALS=true` の場合に `aws login` で取得した認証情報を使用します。

本番AWS環境では認証情報をコードに直接設定せず、AWS SDKの標準認証チェーンを使用する構成です。

そのため、Lambda、ECS、EC2などへデプロイする場合はIAM Roleを利用できます。

AWS Access Key、Secret Access Key、Session Tokenなどをソースコードへ直接記述しないでください。