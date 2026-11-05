import { describe, expect, it } from 'vitest';
import { BedrockQuizGenerator } from '../src/integrations/bedrock-quiz-generator';
import type { BedrockRagConfig } from '../src/integrations/bedrock-ai-provider';
import { ALLOWED_QUIZ_FORMATS, parseGeneratedQuestions } from '../src/integrations/quiz-generation';

const config: BedrockRagConfig = {
  knowledgeBaseId: 'kb-001',
  modelId: 'model-001',
  maxResults: 5,
  materialsBucketName: 'test-materials',
};

// 第3章のファイル (ii-3) に対応する許可済み S3 URI。
const CH3_URI = 's3://test-materials/materials/info2/03_chapter3_part1.pdf';
const OTHER_URI = 's3://other-bucket/materials/info2/01_chapter1.pdf';

function retrievalResult(uri: string, text: string, page = 12) {
  return { score: 0.9, content: { text }, location: { s3Location: { uri } }, metadata: { 'x-amz-bedrock-kb-document-page-number': page } };
}

// agentRuntime(検索) と runtime(Converse生成) の両方を差し替える疑似 Bedrock。
function fakeGenerator(options: { retrieved: ReturnType<typeof retrievalResult>[]; generated: string }) {
  const agentRuntime = { send: async () => ({ retrievalResults: options.retrieved }) };
  const runtime = { send: async () => ({ output: { message: { content: [{ text: options.generated }] } } }) };
  return new BedrockQuizGenerator(config, agentRuntime as never, runtime as never);
}

const validGeneration = JSON.stringify({
  questions: [
    { format: 'single_choice', prompt: '相関係数が取りうる値の範囲はどれか。', choices: ['0〜1', '-1〜1', '0〜100'], correctIndex: 1, explanation: '相関係数は-1から1の範囲をとると教材に記載されている。', conceptTag: '相関係数' },
    { format: 'single_choice', prompt: '外れ値の影響を受けにくい代表値はどれか。', choices: ['平均値', '中央値'], correctIndex: 1, explanation: '中央値は外れ値の影響を受けにくいと教材で説明されている。', conceptTag: '代表値' },
  ],
});

describe('parseGeneratedQuestions (許可リスト・スキーマ検証)', () => {
  it('正しいJSONを検証済みの問題配列にする', () => {
    const questions = parseGeneratedQuestions(validGeneration);
    expect(questions).toHaveLength(2);
    expect(questions[0].correctIndex).toBe(1);
  });

  it('JSONでない出力は破棄する', () => {
    expect(parseGeneratedQuestions('ここに問題を作りました: ...')).toEqual([]);
  });

  it('許可リスト外の形式は破棄する', () => {
    const text = JSON.stringify({ questions: [{ format: 'free_text', prompt: '説明せよ', choices: ['a', 'b'], correctIndex: 0, explanation: 'x', conceptTag: 't' }] });
    expect(parseGeneratedQuestions(text)).toEqual([]);
  });

  it('correctIndexが選択肢範囲外なら破棄する', () => {
    const text = JSON.stringify({ questions: [{ format: 'single_choice', prompt: '問い', choices: ['a', 'b'], correctIndex: 5, explanation: 'x', conceptTag: 't' }] });
    expect(parseGeneratedQuestions(text)).toEqual([]);
  });

  it('選択肢が重複していたら破棄する', () => {
    const text = JSON.stringify({ questions: [{ format: 'single_choice', prompt: '問い', choices: ['同じ', '同じ'], correctIndex: 0, explanation: 'x', conceptTag: 't' }] });
    expect(parseGeneratedQuestions(text)).toEqual([]);
  });

  it('single_choice のみが許可リストに含まれる', () => {
    expect(ALLOWED_QUIZ_FORMATS).toEqual(['single_choice']);
  });
});

describe('BedrockQuizGenerator.generateForChapter', () => {
  it('承認済み教材から章別の下書き問題を生成し、出典を付与する', async () => {
    const generator = fakeGenerator({ retrieved: [retrievalResult(CH3_URI, '相関係数は-1から1の範囲をとる。中央値は外れ値の影響を受けにくい。')], generated: validGeneration });
    const result = await generator.generateForChapter(3, 2);
    expect(result.status).toBe('GENERATED');
    expect(result.chapter).toBe(3);
    expect(result.questions).toHaveLength(2);
    // 正解は選択肢IDに変換される（correctIndex 1 → 'b'）。
    expect(result.questions[0].correctAnswer).toEqual(['b']);
    expect(result.questions[0].choices).toEqual(['0〜1', '-1〜1', '0〜100']);
    // 出典（教材ファイル名＋ページ）が付く。
    expect(result.questions[0].citations[0]).toContain('03_chapter3_part1.pdf');
    expect(result.questions[0].citations[0]).toContain('12ページ');
  });

  it('他バケット/他キーの検索結果は根拠に使わず INSUFFICIENT にする', async () => {
    const generator = fakeGenerator({ retrieved: [retrievalResult(OTHER_URI, '外部データ')], generated: validGeneration });
    const result = await generator.generateForChapter(3, 2);
    expect(result.status).toBe('INSUFFICIENT');
    expect(result.reasonCode).toBe('no-approved-materials');
    expect(result.questions).toEqual([]);
  });

  it('生成JSONが不正なら問題を一切通さない', async () => {
    const generator = fakeGenerator({ retrieved: [retrievalResult(CH3_URI, '教材本文')], generated: 'JSONではない出力' });
    const result = await generator.generateForChapter(3, 2);
    expect(result.status).toBe('INSUFFICIENT');
    expect(result.reasonCode).toBe('invalid-generation');
    expect(result.questions).toEqual([]);
  });

  it('章番号が範囲外ならエラーにする', async () => {
    const generator = fakeGenerator({ retrieved: [retrievalResult(CH3_URI, '教材本文')], generated: validGeneration });
    const result = await generator.generateForChapter(9, 2);
    expect(result.status).toBe('ERROR');
    expect(result.reasonCode).toBe('invalid-chapter');
  });
});
