const {
  retrieveFromKnowledgeBase,
} = require('../src/services/bedrockRetrievalService');
const { evaluateEvidence } = require('../src/services/evidenceService');

const questions = [
  {
    question: '決定木とはどのようなものですか？',
    expectedStatus: 'SUPPORTED',
  },
  {
    question: '情報システムとはどのようなものですか？',
    expectedStatus: 'SUPPORTED',
  },
  {
    question: '今日の京都の天気を教えてください。',
    expectedStatus: 'OUT_OF_SCOPE',
  },
  {
    question: 'おすすめのラーメン屋を教えてください。',
    expectedStatus: 'OUT_OF_SCOPE',
  },
];

async function main() {
  for (const { question, expectedStatus } of questions) {
    console.log('================================');
    console.log(`質問: ${question}`);
    console.log(`期待status: ${expectedStatus}`);

    try {
      const retrievalResults = await retrieveFromKnowledgeBase(question);
      const evaluation = await evaluateEvidence(question, retrievalResults);

      console.log(`status: ${evaluation.status}`);
      console.log(`reason: ${evaluation.reason}`);
      console.log(`supportingIndexes: ${JSON.stringify(evaluation.supportingIndexes)}`);
    } catch (error) {
      console.error(`評価に失敗しました: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error('Evidence evaluation failed:', error);
  process.exitCode = 1;
});
