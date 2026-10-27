const { generateAiResponse } = require('../src/services/aiService');

const questions = [
  '決定木とは何ですか？',
  'プログラミングについて教えてください',
  '今日の天気を教えてください',
  '',
];

questions.forEach((question) => {
  const response = generateAiResponse(question);

  console.log('--------------------');
  console.log(`質問: ${question}`);
  console.log(`status: ${response.status}`);
  console.log(`answer: ${response.answer}`);
  console.log(`citations: ${JSON.stringify(response.citations, null, 2)}`);
});
