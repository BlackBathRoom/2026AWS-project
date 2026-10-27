const {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} = require('@aws-sdk/client-bedrock-agent-runtime');

async function retrieveFromKnowledgeBase(question) {
  if (typeof question !== 'string' || question.trim() === '') {
    return [];
  }

  const knowledgeBaseId = process.env.BEDROCK_KNOWLEDGE_BASE_ID;
  if (!knowledgeBaseId) {
    throw new Error('BEDROCK_KNOWLEDGE_BASE_ID is not set.');
  }

  const client = new BedrockAgentRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
  });

  const command = new RetrieveCommand({
    knowledgeBaseId,
    retrievalQuery: {
      text: question,
    },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        numberOfResults: 5,
      },
    },
  });

  const response = await client.send(command);
  return response.retrievalResults || [];
}

module.exports = { retrieveFromKnowledgeBase };
