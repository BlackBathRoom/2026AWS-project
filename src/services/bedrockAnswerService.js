const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require('@aws-sdk/client-bedrock-runtime');
const { createAwsClientConfig } = require('../config/awsClientConfig');

function getResponseText(response) {
  return response.output?.message?.content
    ?.filter((block) => typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

async function generateGroundedAnswer(question, retrievalResults) {
  if (typeof question !== 'string' || question.trim() === '') {
    throw new Error('question must be a non-empty string.');
  }

  if (!Array.isArray(retrievalResults) || retrievalResults.length === 0) {
    throw new Error('retrievalResults must be a non-empty array.');
  }

  const materials = retrievalResults
    .slice(0, 5)
    .map((result) => result?.content?.text)
    .filter((text) => typeof text === 'string' && text.trim() !== '');

  const modelId = process.env.BEDROCK_MODEL_ID || 'amazon.nova-pro-v1:0';
  const client = new BedrockRuntimeClient(createAwsClientConfig());

  const materialText = materials
    .map((text, index) => `[教材${index + 1}]\n${text}`)
    .join('\n\n');

  const command = new ConverseCommand({
    modelId,
    messages: [
      {
        role: 'user',
        content: [
          {
            text: `あなたは高等学校「情報II」を担当する教員向けの回答を作成します。
以下の教材チャンクだけを根拠として、質問に簡潔で分かりやすい日本語で回答してください。
モデル自身の一般知識、教材にない推測、最新情報、教材に含まれない具体例は追加しないでください。
必要に応じて教材に記載された用語の意味を説明してください。
出典やページ番号は生成しないでください。内部的な推論過程も出力しないでください。
教材だけでは回答できない場合は、INSUFFICIENT だけを返してください。

質問:
${question}

教材チャンク:
${materialText}`,
          },
        ],
      },
    ],
    inferenceConfig: {
      temperature: 0.1,
      maxTokens: 512,
    },
  });

  const response = await client.send(command);
  const responseText = getResponseText(response)?.trim();
  if (!responseText) {
    throw new Error('Nova Pro returned no text for the grounded answer.');
  }

  return responseText;
}

module.exports = { generateGroundedAnswer };
