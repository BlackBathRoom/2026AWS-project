const questions = [
  '決定木とはどのようなものですか？',
  '情報システムとはどのようなものですか？',
  '今日の京都の天気を教えてください。',
  'おすすめのラーメン屋を教えてください。',
];

async function main() {
  for (const question of questions) {
    const response = await fetch('http://localhost:3000/v1/tutor/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ question }),
    });

    const result = await response.json();
    console.log('================================');
    console.log(`question: ${question}`);
    console.log(`HTTP status: ${response.status}`);
    console.log(`status: ${result.status}`);
    console.log(`answer: ${result.answer}`);
    console.log(`citations:\n${JSON.stringify(result.citations, null, 2)}`);
  }
}

main().catch((error) => {
  console.error(`API test failed: ${error.message}`);
  process.exitCode = 1;
});
