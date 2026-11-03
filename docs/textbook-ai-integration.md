# 教材限定AIの統合・実機確認

## 今回の変更

C担当のプロトタイプを正式なTypeScript workerへ移植しました。

1. 承認済みKnowledge Baseから最大5件をRetrieve。
2. 固定7ファイルのS3 URIと本文を検証し、それ以外を除外。
3. Nova ProのConverseで根拠十分性をJSON判定。
4. SUPPORTEDかつ有効なsupportingIndexesがある場合だけ、選択された本文で再度Converse。
5. 選択された検索結果の実メタデータから出典を作り、同一URI・ページを重複排除。
6. 既存のSQS worker、DynamoDBジョブ、所有者制限、利用上限、ポーリングを継続利用。

スコア閾値は今回のBedrock回答経路では使いません。既存のassessGrounding関数は互換用に残しています。
モデルの指示だけで誤回答が完全になくなることは保証できません。実機の教材内外テストを行います。

## APIと画面

POST /api/v1/materials/:id/questions の既存question/requestedActionに、任意のreaderContextを追加しました。

```json
{
  "question": "決定木とはどのようなものですか？",
  "requestedAction": "explanation",
  "readerContext": {
    "filename": "03_chapter3_part2.pdf",
    "page": 1,
    "text": "表示ページからPDF.jsで抽出した参考本文"
  }
}
```

questionは1〜2000文字、参考本文は最大4000文字、pageは正の整数です。
filenameはURLの章に登録されたPDF名だけを許可します。readerContextなしの既存API利用も維持します。
ブラウザ本文は参照先の理解と検索補助にだけ使い、証拠・認可・出典として信用しません。
認証済みユーザー、所属、研修、learningモード、guided、allowAnswer=falseは引き続きサーバーで決定します。

結果の既存契約message/citations:string[]/status/responseTypeは維持します。
例: `03_chapter3_part2.pdf / PDF 1ページ`。KBがページ番号を返さない場合は「ページ番号未取得」と表示し、ページを推測しません。
ページ番号の取得可否はKBの構成・チャンク方式にも依存します。実機結果で確認してください。
既存のopenapi/openapi.yamlは変更していません。教材拡張APIの追加項目はこの文書と契約テストに記録しています。

## ローカル検証

プロジェクト指定のNode.js 22を使用してください。Lambdaは既存と同じNode.js 24です。
package.jsonと両方のpackage-lock.jsonは変更していません。

```bash
npm ci
npm run build
npm test
cd cdk
npm ci
npm run build
cd ..
```

提供前の確認: Node.js 22と24でビルド・108件のテスト成功。CDK build/synth成功。
AWS認証を使用した実機テストは提供元では未実施です。

## AWS設定の確認（読み取りのみ）

```bash
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1
aws sts get-caller-identity
```

期限切れの場合は `aws login --remote --region us-east-1` で再認証してください。
次のKB IDは前回確認した値です。現在の実環境のものと照合します。

```bash
python3 scripts/check-textbook-ai-aws.py \
  --knowledge-base-id J5GQR4E85D \
  --model-id amazon.nova-pro-v1:0
```

出力のparametersがCDKへ渡す実値です。KB ACTIVEやモデルのメタデータ参照成功だけでは、教材同期完了やInvokeModel権限を保証しません。
C担当が実際に使ったモデルがinference profileなら、そのID/ARNを--model-idへ指定してください。
例は `us.amazon.nova-pro-v1:0`。profileを使用する場合も、配下がNova Proであることを確認します。
profileの宛先リージョンの基盤モデルARNはGetInferenceProfileの実値から取得します。ワイルドカードには広げません。

## ローカルからBedrock本体を実機確認

前の出力で確認できたKnowledgeBaseIdとModelIdを設定します。以下のモデルIDは直接呼出しが実環境で使える場合の例です。

```bash
export BEDROCK_KNOWLEDGE_BASE_ID=J5GQR4E85D
export BEDROCK_MODEL_ID=amazon.nova-pro-v1:0
export MATERIALS_BUCKET_NAME=info2-materials-432410731458-us-east-1-an
export AWS_USE_LOGIN_CREDENTIALS=true
export AWS_PROFILE=default
node --import tsx scripts/smoke-textbook-ai.ts
node --import tsx scripts/smoke-textbook-ai.ts --live
```

--liveなしは質問一覧を表示するだけです。--liveは実際にBedrockを呼び、教材内2問と教材外2問を確認します。
教材内はSUPPORTEDと実出典、教材外はOUT_OF_SCOPEと出典なしを期待します。
CLIユーザーで成功してもLambda実行ロールでの成功とは別です。次のSQS経由テストも必要です。

## デプロイ順序

最初はTextbookAiEnabled=falseのままです。設定の確認・diffのレビュー後に実行します。

### 1. Backend更新（AI無効）

```bash
cd cdk
npx cdk diff Information2BackendStack --method=template
npx cdk deploy Information2BackendStack --parameters TextbookAiEnabled=false
```

教材表示・認証のリソース置換を意図していません。予想外の削除・置換が出た場合は差分を確認してください。

### 2. AI worker更新

プロジェクト直下のターミナルで、読み取り確認の出力parametersから得た3値を設定します。
BEDROCK_KNOWLEDGE_BASE_ID、BEDROCK_MODEL_IDは上記設定、MODEL_INVOKE_ARNSはparameters.ModelInvokeArnsのカンマ区切り文字列です。
cdkディレクトリから実行:

```bash
npx cdk diff Information2TutorAiStack --method=template
npx cdk deploy Information2TutorAiStack --exclusively \
  --parameters KnowledgeBaseId="$BEDROCK_KNOWLEDGE_BASE_ID" \
  --parameters ModelId="$BEDROCK_MODEL_ID" \
  --parameters ModelInvokeArns="$MODEL_INVOKE_ARNS"
cd ..
```

MODEL_INVOKE_ARNSが空のまま実行しないでください。直接モデルならその基盤モデルARN、profileならprofile ARNと全宛先基盤モデルARNです。
worker timeout90秒、SQS visibility540秒（6倍）、ブラウザ待機120秒。SDK呼出しには個別の時間制限があります。
workerには固定教材バケット名を注入し、AWS SDKをバンドルします。既存IAMロールから認証します。AWS_USE_LOGIN_CREDENTIALSはLambdaへ設定しません。
監査ログは書込み前にtutor-workerストリームを作成し、既に存在すれば再利用します。既存のCreateLogStream権限を使います。

### 3. SQS→Lambda→DynamoDBを実機確認（画面のAIはまだ無効）

```bash
export BACKEND_TABLE_NAME=Information2BackendStack-BackendTable8DA45177-1LOQ28K1I257P
export TUTOR_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/432410731458/information2-tutor-jobs.fifo
node --import tsx scripts/smoke-textbook-ai.ts --live --queue
```

このテストはCLI認証で合成テストジョブ4件をDynamoDBに作成し、実SQSへ投入します。
実ユーザーのプロフィール・所属・利用上限は変更しません。生成処理はデプロイ済みworkerのIAMロールで実行されます。
4件のjob-smoke-*レコードと監査ログは確認用に残します。ユーザー向けAPI認証・上限ゲートはこの管理者テストでは経由しません。
FAILEDならCloudWatchのworkerログを確認します。権限不足時にResource:*へ広げず、KB/profile/model ARNを照合します。

### 4. フロントを更新してAIを有効化

プロジェクト直下から:

```bash
aws s3 cp public/js/study-reader.js s3://bittomo-frontend/js/study-reader.js \
  --content-type application/javascript --cache-control no-cache --region us-east-1
aws cloudfront create-invalidation --distribution-id ESNME3WUFU6PP --paths '/js/study-reader.js'
cd cdk
npx cdk deploy Information2BackendStack --parameters TextbookAiEnabled=true
cd ..
```

bittomo.clickを再読み込みしてログインし、教材内の質問で回答・PDF名・実ページ番号を確認します。
「このページの要点」等のページ参照質問と、現在の天気など教材外の質問も画面から確認します。
画面APIは認証・所属・章の制限・1日20回・同時実行制限・所有者だけの結果取得を維持しています。

## 問題が出た場合

画面のAIを停止する最小操作:

```bash
cd cdk
npx cdk deploy Information2BackendStack --parameters TextbookAiEnabled=false
```

教材閲覧は継続できます。既にキューに入ったジョブは完了することがあります。
ソースを戻す場合はインストーラーがリポジトリ外に作ったバックアップと変更一覧を確認してください。

## 参照資料

- プロジェクト内: src/services/evidenceService.js、bedrockAnswerService.js、aiService.js（変更せず保持）
- AWS Converse: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html
- Inference profile: https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-use.html
- profileの実ARN取得: https://docs.aws.amazon.com/cli/latest/reference/bedrock/get-inference-profile.html
- SQS visibility: https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html
- ページメタデータ: https://docs.aws.amazon.com/bedrock/latest/userguide/kb-test-config.html
