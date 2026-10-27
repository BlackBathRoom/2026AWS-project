const {
  retrieveFromKnowledgeBase,
} = require('../src/services/bedrockRetrievalService');

const question = '決定木とはどのようなものですか？';

async function main() {
  const results = await retrieveFromKnowledgeBase(question);

  console.log(`質問: ${question}`);
  results.forEach((result, index) => {
    const s3Uri = result.location?.s3Location?.uri || 'N/A';
    const pageNumber = result.metadata?.['x-amz-bedrock-kb-document-page-number'] ?? 'N/A';

    console.log('--------------------');
    console.log(`検索結果 ${index + 1}`);
    console.log(`score: ${result.score ?? 'N/A'}`);
    console.log(`content.text: ${result.content?.text || 'N/A'}`);
    console.log(`S3 URI: ${s3Uri}`);
    console.log(`page number: ${pageNumber}`);
  });
  console.log('--------------------');
}

main().catch((error) => {
  console.error('Bedrock Knowledge Base retrieval failed:', error);
  process.exitCode = 1;
});
