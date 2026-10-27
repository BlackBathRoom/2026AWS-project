const {
  retrieveFromKnowledgeBase,
} = require('../src/services/bedrockRetrievalService');
const { evaluateEvidence } = require('../src/services/evidenceService');
const {
  generateGroundedAnswer,
} = require('../src/services/bedrockAnswerService');

const questions = [
  '決定木とはどのようなものですか？',
  '情報システムとはどのようなものですか？',
];

async function main() {
  for (const question of questions) {
    console.log('================================');
    console.log(`質問: ${question}`);

    try {
      const retrievalResults = await retrieveFromKnowledgeBase(question);
      const evaluation = await evaluateEvidence(question, retrievalResults);

      console.log(`evidence status: ${evaluation.status}`);
      if (evaluation.status === 'SUPPORTED') {
        const answer = await generateGroundedAnswer(question, retrievalResults);
        console.log(`生成された回答: ${answer}`);
      } else {
        console.log('回答生成をスキップしました');
      }
    } catch (error) {
      console.error(`処理に失敗しました: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error('Bedrock answer test failed:', error);
  process.exitCode = 1;
});
