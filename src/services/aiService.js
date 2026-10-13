const { retrieveRelevantMaterials } = require('./retrievalService');

function generateAiResponse(question) {
  if (typeof question !== 'string' || question.trim() === '') {
    return {
      status: 'OUT_OF_SCOPE',
      answer: '質問を入力してください。',
      citations: [],
    };
  }

  const relevantMaterials = retrieveRelevantMaterials(question);

  if (relevantMaterials.length === 0) {
    return {
      status: 'OUT_OF_SCOPE',
      answer: '固定教材の範囲内に回答の根拠が見つかりませんでした。',
      citations: [],
    };
  }

  return {
    status: 'SUPPORTED',
    answer: '固定教材に関連する情報が見つかりました。',
    citations: relevantMaterials.map((material) => ({
      documentId: material.id,
      title: material.title,
      fileName: material.fileName,
      s3Key: material.s3Key,
      page: null,
    })),
  };
}

module.exports = { generateAiResponse };
