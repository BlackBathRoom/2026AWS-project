// 環境変数に応じて小テスト問題生成器を解決する。
// Bedrock 設定 (BEDROCK_KNOWLEDGE_BASE_ID / BEDROCK_MODEL_ID / MATERIALS_BUCKET_NAME) が揃う環境でのみ
// 実インスタンスを返し、未設定のローカル/テストでは null を返す。ルート層はフォールバック動作を選べる。

import { BedrockQuizGenerator } from './bedrock-quiz-generator';
import { bedrockConfigFromEnv } from './bedrock-ai-provider';

export interface QuizGeneratorLike {
  generateForChapter(chapter: number, count?: number): Promise<import('./bedrock-quiz-generator').QuizGenerationResult>;
}

let cached: QuizGeneratorLike | null | undefined;

export function resolveQuizGenerator(env: NodeJS.ProcessEnv = process.env): QuizGeneratorLike | null {
  if (cached !== undefined) return cached;
  if (!env.BEDROCK_KNOWLEDGE_BASE_ID || !env.BEDROCK_MODEL_ID || !env.MATERIALS_BUCKET_NAME) {
    cached = null;
    return cached;
  }
  cached = new BedrockQuizGenerator(bedrockConfigFromEnv(env));
  return cached;
}

/** テスト用: 生成器を差し替える / キャッシュをリセットする。 */
export function setQuizGenerator(generator: QuizGeneratorLike | null | undefined): void {
  cached = generator;
}
