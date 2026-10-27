const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require('@aws-sdk/client-bedrock-runtime');
const { createAwsClientConfig } = require('../config/awsClientConfig');

const VALID_STATUSES = new Set([
  'SUPPORTED',
  'INSUFFICIENT',
  'OUT_OF_SCOPE',
]);

function getEvidence(result) {
  return {
    contentText: result?.content?.text ?? null,
    score: result?.score ?? null,
    s3Uri: result?.location?.s3Location?.uri ?? null,
    pageNumber: result?.metadata?.['x-amz-bedrock-kb-document-page-number'] ?? null,
  };
}

function getResponseText(response) {
  return response.output?.message?.content
    ?.filter((block) => typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

async function evaluateEvidence(question, retrievalResults) {
  if (typeof question !== 'string' || question.trim() === '') {
    return {
      status: 'OUT_OF_SCOPE',
      reason: '質問が入力されていません。',
      supportingIndexes: [],
    };
  }

  if (!Array.isArray(retrievalResults) || retrievalResults.length === 0) {
    return {
      status: 'OUT_OF_SCOPE',
      reason: '回答の根拠となる教材が見つかりませんでした。',
      supportingIndexes: [],
    };
  }

  const evidence = retrievalResults.slice(0, 5).map(getEvidence);
  const evidenceText = evidence
    .map((result, index) => `[${index}]\n${result.contentText || ''}`)
    .join('\n\n');
  const modelId = process.env.BEDROCK_MODEL_ID || 'amazon.nova-pro-v1:0';
  const client = new BedrockRuntimeClient(createAwsClientConfig());

  const command = new ConverseCommand({
    modelId,
    messages: [
      {
        role: 'user',
        content: [
          {
            text: `あなたは情報II教材の検索結果が、質問への回答根拠として十分かを評価します。
判定根拠は、以下に渡す検索結果だけに限定してください。あなた自身の一般知識や最新情報は使用しないでください。
単語や表現が似ているだけではSUPPORTEDにしないでください。複数の検索結果を組み合わせることで質問の核心に正確に回答できる場合はSUPPORTEDとしてください。1件だけで完全な定義文が完結している必要はありません。

判定基準:
- SUPPORTED: 1件または複数件の検索結果を組み合わせることで、質問の核心へ直接かつ正確に回答できる十分な根拠がある。
- INSUFFICIENT: 質問自体は情報IIや固定教材のテーマ・学習範囲に含まれるが、今回の検索結果だけでは正確な回答に必要な情報が不足している。
- OUT_OF_SCOPE: 質問が固定教材だけでは回答できない。現在の天気・ニュース・株価・交通情報などのリアルタイム情報、地域固有の現在情報、店舗や飲食店のおすすめ、固定教材外の一般知識を必要とする質問を含む。

教材中に似た単語や学習用の例があるだけでは、質問への根拠になりません。例えば教材に「今日の天気」「最高気温25℃」という例があっても、「今日の京都の天気」はOUT_OF_SCOPEです。現在の京都の天気を示す根拠ではないため、supportingIndexesは空配列にしてください。

質問:
${question}

検索結果（最大5件）:
${evidenceText}

質問へ直接回答するための根拠として利用できる検索結果だけを、0始まりの番号でsupportingIndexesに含めてください。複数件を組み合わせて回答できる場合は、必要な検索結果をすべて含めてください。
質問と関連しているだけで、回答の直接的な根拠ではない検索結果は含めないでください。
SUPPORTEDの場合はsupportingIndexesを1件以上にしてください。
OUT_OF_SCOPEの場合はsupportingIndexesを空配列にしてください。
INSUFFICIENTの場合は、部分的な根拠が明確に存在するときだけindexを含めてください。

JSONのみを返してください。Markdownやコードブロックは使用しないでください。
形式:
{"status":"SUPPORTED","reason":"簡潔な日本語の理由","supportingIndexes":[0,1]}
statusはSUPPORTED、INSUFFICIENT、OUT_OF_SCOPEのいずれか1つだけです。
supportingIndexesは検索結果の0始まりのindex配列です。`,
          },
        ],
      },
    ],
    inferenceConfig: {
      temperature: 0,
    },
  });

  const response = await client.send(command);
  const responseText = getResponseText(response);
  if (!responseText) {
    throw new Error('Nova Pro returned no text for the evidence evaluation.');
  }

  let evaluation;
  try {
    evaluation = JSON.parse(responseText);
  } catch (error) {
    throw new Error(`Nova Pro returned invalid JSON: ${error.message}`);
  }

  if (!evaluation || !VALID_STATUSES.has(evaluation.status)) {
    throw new Error(
      'Nova Pro returned an invalid status. Expected SUPPORTED, INSUFFICIENT, or OUT_OF_SCOPE.',
    );
  }

  if (!Array.isArray(evaluation.supportingIndexes)) {
    throw new Error('Nova Pro returned invalid supportingIndexes. Expected an array.');
  }

  const maxSupportingIndex = Math.min(5, retrievalResults.length);
  if (evaluation.supportingIndexes.some(
    (index) => !Number.isInteger(index) || index < 0 || index >= maxSupportingIndex,
  )) {
    throw new Error(
      'Nova Pro returned an invalid supportingIndexes value. Each index must reference a retrieved result.',
    );
  }

  if (evaluation.status === 'SUPPORTED' && evaluation.supportingIndexes.length === 0) {
    throw new Error(
      'Nova Pro returned SUPPORTED without any supportingIndexes.',
    );
  }

  if (evaluation.status === 'OUT_OF_SCOPE' && evaluation.supportingIndexes.length > 0) {
    throw new Error(
      'Nova Pro returned OUT_OF_SCOPE with supportingIndexes. Expected an empty array.',
    );
  }

  return evaluation;
}

module.exports = { evaluateEvidence };
