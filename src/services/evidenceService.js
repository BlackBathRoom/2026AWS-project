const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require('@aws-sdk/client-bedrock-runtime');

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
    };
  }

  if (!Array.isArray(retrievalResults) || retrievalResults.length === 0) {
    return {
      status: 'OUT_OF_SCOPE',
      reason: '回答の根拠となる教材が見つかりませんでした。',
    };
  }

  const evidence = retrievalResults.slice(0, 5).map(getEvidence);
  const modelId = process.env.BEDROCK_MODEL_ID || 'amazon.nova-pro-v1:0';
  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  const command = new ConverseCommand({
    modelId,
    messages: [
      {
        role: 'user',
        content: [
          {
            text: `あなたは情報II教材の検索結果が、質問への回答根拠として十分かを評価します。
判定根拠は、以下に渡す検索結果だけに限定してください。あなた自身の一般知識や最新情報は使用しないでください。
単語や表現が似ているだけではSUPPORTEDにしないでください。例えば、教材中の例として天気が書かれていても、現在の特定地域の天気を示す情報でなければ、その天気の質問はOUT_OF_SCOPEです。

判定基準:
- SUPPORTED: 検索結果に、質問へ直接かつ正確に回答するための十分な根拠がある。
- INSUFFICIENT: 検索結果は質問のテーマに関連するが、正確に回答するには情報が不足している。
- OUT_OF_SCOPE: 質問が固定された情報II教材の範囲外、または検索結果が回答根拠として実質的に無関係である。

質問:
${question}

検索結果（最大5件）:
${JSON.stringify(evidence, null, 2)}

JSONのみを返してください。Markdownやコードブロックは使用しないでください。
形式:
{"status":"SUPPORTED","reason":"簡潔な日本語の理由"}
statusはSUPPORTED、INSUFFICIENT、OUT_OF_SCOPEのいずれか1つだけです。`,
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

  return evaluation;
}

module.exports = { evaluateEvidence };
