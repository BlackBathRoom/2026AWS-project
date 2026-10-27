const { generateAiResponse } = require('../src/services/aiService');

const questions = [
  '決定木とはどのようなものですか？',
  '情報システムとはどのようなものですか？',
  '今日の京都の天気を教えてください。',
  'おすすめのラーメン屋を教えてください。',
];

async function main() {
  for (const question of questions) {
    console.log('================================');
    console.log(`question: ${question}`);

    try {
      const response = await generateAiResponse(question);
      console.log(`status: ${response.status}`);
      console.log(`answer: ${response.answer}`);
      console.log(`citations:\n${JSON.stringify(response.citations, null, 2)}`);
    } catch (error) {
      console.error(`処理に失敗しました: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  console.error('AI service test failed:', error);
  process.exitCode = 1;
});
