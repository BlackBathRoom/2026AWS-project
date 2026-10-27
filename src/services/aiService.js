const {
  retrieveFromKnowledgeBase,
} = require('./bedrockRetrievalService');
const { evaluateEvidence } = require('./evidenceService');
const {
  generateGroundedAnswer,
} = require('./bedrockAnswerService');

const INSUFFICIENT_RESPONSE = {
  status: 'INSUFFICIENT',
  answer: '関連する教材は見つかりましたが、回答するための十分な根拠がありませんでした。',
  citations: [],
};

function createCitations(retrievalResults) {
  const citations = [];
  const seen = new Set();

  for (const result of retrievalResults) {
    const s3Uri = result?.location?.s3Location?.uri;
    if (typeof s3Uri !== 'string' || s3Uri === '') {
      continue;
    }

    const fileName = s3Uri.split('/').pop();
    const page = result?.metadata?.['x-amz-bedrock-kb-document-page-number'] ?? null;
    const key = `${fileName}\u0000${page}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    citations.push({
      fileName,
      s3Uri,
      page,
    });
  }

  return citations;
}

async function generateAiResponse(question) {
  if (typeof question !== 'string' || question.trim() === '') {
    return {
      status: 'OUT_OF_SCOPE',
      answer: '質問を入力してください。',
      citations: [],
    };
  }

  const retrievalResults = await retrieveFromKnowledgeBase(question);
  const evidence = await evaluateEvidence(question, retrievalResults);

  if (evidence.status === 'OUT_OF_SCOPE') {
    return {
      status: 'OUT_OF_SCOPE',
      answer: '固定教材の範囲内に回答の根拠が見つかりませんでした。',
      citations: [],
    };
  }

  if (evidence.status === 'INSUFFICIENT') {
    return INSUFFICIENT_RESPONSE;
  }

  if (evidence.status !== 'SUPPORTED') {
    throw new Error(`Unexpected evidence status: ${evidence.status}`);
  }

  const answer = await generateGroundedAnswer(question, retrievalResults);
  if (answer.trim() === 'INSUFFICIENT') {
    return INSUFFICIENT_RESPONSE;
  }

  return {
    status: 'SUPPORTED',
    answer,
    citations: createCitations(retrievalResults),
  };
}

module.exports = { generateAiResponse };
