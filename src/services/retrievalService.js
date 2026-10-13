const materials = require('../data/materials.json');

const dataScienceKeywords = ['決定木', '機械学習', 'データサイエンス', 'machine learning', 'data science'];
const programmingKeywords = ['プログラミング', 'programming'];

function includesKeyword(question, keywords) {
  return keywords.some((keyword) => question.includes(keyword));
}

function findMaterialById(id) {
  return materials.find((material) => material.id === id);
}

function retrieveRelevantMaterials(question) {
  if (typeof question !== 'string') {
    return [];
  }

  const normalizedQuestion = question.toLowerCase();
  const relevantMaterials = [];

  if (includesKeyword(normalizedQuestion, dataScienceKeywords.map((keyword) => keyword.toLowerCase()))) {
    const material = findMaterialById('info2-chapter3-part1');
    if (material) {
      relevantMaterials.push(material);
    }
  }

  if (includesKeyword(normalizedQuestion, programmingKeywords.map((keyword) => keyword.toLowerCase()))) {
    const material = findMaterialById('info2-chapter4');
    if (material) {
      relevantMaterials.push(material);
    }
  }

  return relevantMaterials;
}

module.exports = { retrieveRelevantMaterials };
