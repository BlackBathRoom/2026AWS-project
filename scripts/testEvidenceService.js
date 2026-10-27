const {
  retrieveFromKnowledgeBase,
} = require('../src/services/bedrockRetrievalService');
const { evaluateEvidence } = require('../src/services/evidenceService');

const questions = [
  '決定木とはどのようなものですか？',
  '情報システムとはどのようなものですか？',
  '今日の京都の天気を教えてください。',
  'おすすめのラーメン屋を教えてください。',
];

async function main() {
  for (const question of questions) {
    console.log('================================');
    console.log(`質問: ${question}`);

    try {
      const retrievalResults = await retrieveFromKnowledgeBase(question);
      const evaluation = await evaluateEvidence(question, retrievalResults);

      console.log(`status: ${evaluation.status}`);
      console.log(`reason: ${evaluation.reason}`);
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
