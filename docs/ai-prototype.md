# 情報Ⅱ 教員支援AI RAGプロトタイプ

## 概要

本ドキュメントは、情報Ⅱを担当する教員向けAI学習支援機能について、Amazon Bedrockを利用して作成・検証したRAGプロトタイプの内容を記録するものです。

本プロトタイプでは、固定された情報Ⅱ教材のみを回答根拠として使用し、教材外の質問に対してモデル自身の一般知識や最新情報で回答しない構成を検証しました。

> このドキュメントはプロトタイプ実装の記録です。  
> mainブランチにおける正式なバックエンド構成・TypeScript構成については、ルートの `README.md` および `docs/` 配下の設計資料を参照してください。

---

## 目的

主な目的は以下です。

- 情報Ⅱの固定教材から関連箇所を検索する
- 検索された教材が質問への回答根拠として十分か判定する
- 十分な根拠がある場合のみAI回答を生成する
- 回答に利用した教材のPDF名・ページ番号を出典として返す
- 教材外の質問には回答しない
- RAGによる誤回答・ハルシネーションを抑制する

---

## 使用したAWSサービス

### Amazon S3

情報Ⅱの固定教材PDFを保存するために使用しました。

教材はユーザーがアップロードする方式ではなく、運営側で管理する固定教材のみを対象としています。

### Amazon Bedrock Knowledge Base

S3上の教材を検索可能なKnowledge Baseとして利用しました。

ユーザーの質問に対して、関連性の高い教材チャンクを最大5件取得します。

### Amazon Titan Text Embeddings V2

Knowledge Baseで教材をベクトル化するためのEmbeddingモデルとして使用しました。

### Amazon S3 Vectors

Knowledge Baseのベクトルストアとして使用しました。

### Amazon Nova Pro

以下の2つの処理に使用しました。

1. Knowledge Baseから取得した教材が質問への回答根拠として十分か判定
2. 回答根拠として選択された教材のみを使用した回答生成

---

## 使用教材

文部科学省「高等学校情報科『情報Ⅱ』教員研修用教材」を固定教材として使用しました。

```text
00_cover.pdf
01_chapter1.pdf
02_chapter2.pdf
03_chapter3_part1.pdf
03_chapter3_part2.pdf
04_chapter4.pdf
05_chapter5.pdf
```

教材はS3上の以下のような構成で管理します。

```text
materials/
└── info2/
    ├── 00_cover.pdf
    ├── 01_chapter1.pdf
    ├── 02_chapter2.pdf
    ├── 03_chapter3_part1.pdf
    ├── 03_chapter3_part2.pdf
    ├── 04_chapter4.pdf
    └── 05_chapter5.pdf
```

---

## RAG処理フロー

プロトタイプでは次の流れで質問を処理します。

```text
ユーザーの質問
        ↓
Amazon Bedrock Knowledge Base
        ↓
関連教材を最大5件検索
        ↓
Amazon Nova Proによる根拠十分性判定
        ↓
SUPPORTED / INSUFFICIENT / OUT_OF_SCOPE
        ↓
SUPPORTEDの場合
        ↓
supportingIndexesで回答根拠を選択
        ↓
選択した教材のみをNova Proへ渡す
        ↓
回答生成
        ↓
PDF名・ページ番号からcitationsを生成
        ↓
レスポンス
```

---

## 根拠十分性判定

Knowledge Baseは意味的に近い文章を検索できますが、

```text
関連する文章が検索された
```

ことと、

```text
その文章だけで質問へ正確に回答できる
```

ことは同じではありません。

そのため、Knowledge Base検索後にNova Proを利用して根拠十分性を判定します。

判定結果は以下の3種類です。

### SUPPORTED

固定教材から取得された1件または複数件の検索結果を組み合わせることで、質問の核心へ正確に回答できる場合です。

### INSUFFICIENT

質問自体は情報Ⅱや固定教材のテーマに含まれているものの、今回取得された教材だけでは正確な回答に必要な情報が不足している場合です。

### OUT_OF_SCOPE

固定教材だけでは回答できない質問です。

例:

- 現在の天気
- 現在のニュース
- 株価
- リアルタイム交通情報
- 地域固有の現在情報
- 店舗・飲食店のおすすめ
- 固定教材外の一般的な質問

教材に似た単語や例が存在していても、それが質問そのものへの回答根拠にならない場合は `OUT_OF_SCOPE` とします。

---

## supportingIndexes

Nova Proによる根拠十分性判定では、statusだけでなく、

```json
{
  "status": "SUPPORTED",
  "reason": "検索結果に質問へ回答するための十分な根拠があります。",
  "supportingIndexes": [0, 1]
}
```

のように `supportingIndexes` も取得します。

`supportingIndexes` はKnowledge Baseから取得した検索結果のうち、

```text
質問への回答に直接利用できる教材チャンク
```

だけを示す0始まりのindexです。

これにより、

```text
Knowledge Baseが検索した教材
```

と、

```text
実際に回答根拠として使用した教材
```

を分離しています。

回答生成およびcitations生成には `supportingIndexes` で選択された教材だけを使用します。

---

## 回答生成

根拠十分性判定が `SUPPORTED` の場合のみ、Amazon Nova Proによる回答生成を行います。

Nova ProにはKnowledge Baseのすべての検索結果ではなく、`supportingIndexes` で選択された教材本文のみを渡します。

回答生成では以下のルールを設定しました。

- 固定教材のみを根拠とする
- Nova Pro自身の一般知識を利用しない
- 教材に存在しない情報を推測しない
- 最新情報を補完しない
- 教員向けに分かりやすい日本語で回答する
- 検索結果に存在しない具体例を勝手に追加しない
- 出典情報をAI自身に生成させない

---

## citations

出典はNova Proに生成させず、Knowledge Baseから実際に取得したメタデータを使用してアプリケーション側で生成します。

例:

```json
{
  "fileName": "03_chapter3_part2.pdf",
  "s3Uri": "s3://.../materials/info2/03_chapter3_part2.pdf",
  "page": 1
}
```

同じPDF・同じページが複数の検索結果として取得された場合は重複を削除します。

---

## プロトタイプAPI

プロトタイプでは以下のAPIを作成して動作確認しました。

```text
POST /v1/tutor/ask
```

リクエスト例:

```json
{
  "question": "決定木とはどのようなものですか？"
}
```

### SUPPORTED

```json
{
  "status": "SUPPORTED",
  "answer": "教材を根拠として生成した回答",
  "citations": [
    {
      "fileName": "03_chapter3_part2.pdf",
      "s3Uri": "s3://...",
      "page": 1
    }
  ]
}
```

### OUT_OF_SCOPE

```json
{
  "status": "OUT_OF_SCOPE",
  "answer": "固定教材の範囲内に回答の根拠が見つかりませんでした。",
  "citations": []
}
```

### INSUFFICIENT

```json
{
  "status": "INSUFFICIENT",
  "answer": "関連する教材は見つかりましたが、回答するための十分な根拠がありませんでした。",
  "citations": []
}
```

---

## 動作確認

以下の質問を使用してRAG処理を確認しました。

### 教材内

```text
決定木とはどのようなものですか？
```

結果:

```text
SUPPORTED
```

回答根拠:

```text
03_chapter3_part2.pdf
page 1
```

---

```text
情報システムとはどのようなものですか？
```

結果:

```text
SUPPORTED
```

回答根拠として選択された教材:

```text
04_chapter4.pdf
```

Knowledge Baseが検索しただけで回答に直接必要ではなかった他章の教材はcitationから除外されることを確認しました。

---

### 教材外

```text
今日の京都の天気を教えてください。
```

結果:

```text
OUT_OF_SCOPE
```

教材内に「今日の天気」という学習用の例が存在していても、現在の京都の天気を示す情報ではないため、回答しません。

---

```text
おすすめのラーメン屋を教えてください。
```

結果:

```text
OUT_OF_SCOPE
```

固定教材だけでは回答できないため、回答を生成しません。

---

## ベクトル検索スコアの検証

Knowledge Baseの検索スコアだけで教材内外を判定できるかも検証しました。

例:

```text
決定木
Top score: 約0.505

情報システム
Top score: 約0.545

今日の京都の天気
Top score: 約0.407

おすすめのラーメン屋
Top score: 約0.371
```

「今日の京都の天気」は教材中に「今日の天気」という例が存在するため、教材外の質問にもかかわらず比較的高い検索スコアになりました。

この結果から、

```text
ベクトル検索スコアが高い
=
質問へ回答できる
```

とは限らないことが確認できました。

そのため、本プロトタイプでは固定スコア閾値のみで判断せず、Nova Proによる根拠十分性判定を追加しています。

---

## AWS認証

ローカル開発ではAWS CLIの `aws login` を利用しました。

Node.jsからはAWS SDK v3の `fromLoginCredentials()` を利用できる構成を検証しています。

ローカル開発時:

```text
AWS_USE_LOGIN_CREDENTIALS=true
AWS_PROFILE=default
```

AWS環境では認証情報をコードへ直接設定せず、AWS SDK標準の認証チェーンおよびIAM Roleを利用する想定です。

Access Key、Secret Access Key、Session Tokenなどはソースコードや本ドキュメントへ記載しません。

---

## Node.js

プロトタイプ検証時にNode.js 18では、AWS Login認証のトークン更新処理でWeb Crypto APIに関する問題が発生しました。

そのためNode.js 22へ移行し、正常動作を確認しています。

プロジェクトでは以下を使用します。

```text
Node.js 22
```

---

## プロトタイプで作成した主な処理

プロトタイプでは以下の責務を分離して実装・検証しました。

```text
Knowledge Base検索
        ↓
根拠十分性判定
        ↓
回答根拠チャンク選択
        ↓
教材限定回答生成
        ↓
citations生成
```

主な役割:

### Retrieval

Amazon Bedrock Knowledge Baseから質問に関連する教材を取得します。

### Evidence evaluation

取得した教材が質問への回答根拠として十分かNova Proで判定します。

### Answer generation

`SUPPORTED` の場合だけ、選択された教材を根拠として回答を生成します。

### AI service

検索・判定・回答生成・citations生成を統合します。

---

## セキュリティ・ガバナンス上の考慮

本プロトタイプでは以下を意識しています。

- 回答根拠を固定教材に限定
- 教材外質問への回答抑制
- AI自身による架空の出典生成を防止
- S3 URI・ページ番号は実際のKnowledge Base検索結果から生成
- AWS認証情報をソースコードへハードコードしない
- ローカルとAWS環境で認証方式を分離可能にする

---

## 今後の統合について

本プロトタイプではRAG処理そのものの成立性を確認しました。

mainブランチではチーム全体の構成としてTypeScriptベースのバックエンドおよびAI/RAG統合構成が定義されています。

今後の正式実装では、プロトタイプで確認した以下の考え方をTypeScript側のAI/RAG構成へ反映します。

- 固定教材限定RAG
- 根拠十分性判定
- `SUPPORTED / INSUFFICIENT / OUT_OF_SCOPE`
- 回答根拠チャンクの選択
- 教材限定回答生成
- 実際に利用した教材だけをcitationとして返却

正式な構成・API契約・デプロイ方法については、ルートの `README.md` および関連する `docs/` を参照してください。