const {
  retrieveFromKnowledgeBase,
} = require('../src/services/bedrockRetrievalService');

const questions = [
  '決定木とはどのようなものですか？',
  '情報システムとはどのようなものですか？',
  '今日の京都の天気を教えてください。',
  'おすすめのラーメン屋を教えてください。',
];

function getS3Uri(result) {
  return result?.location?.s3Location?.uri || 'N/A';
}

function getPageNumber(result) {
  return result?.metadata?.['x-amz-bedrock-kb-document-page-number'] ?? 'N/A';
}

async function main() {
  for (const question of questions) {
    const results = await retrieveFromKnowledgeBase(question);
    const topResult = results[0];

    console.log('================================');
    console.log(`質問:\n${question}`);
    console.log('');
    console.log(`Top result score:\n${topResult?.score ?? 'N/A'}`);
    console.log('');
    console.log(`Top result:\n${topResult?.content?.text || 'N/A'}`);
    console.log('');
    console.log(`S3 URI:\n${getS3Uri(topResult)}`);
    console.log(`page number:\n${getPageNumber(topResult)}`);
    console.log('');
    console.log('Scores:');
    results.forEach((result, index) => {
      console.log(`${index + 1}: ${result.score ?? 'N/A'}`);
    });
    console.log('================================');
  }
}

main().catch((error) => {
  console.error('Retrieval evaluation failed:', error);
  process.exitCode = 1;
});
