// 承認済み教材（PDF）の RAG を使って章別の小テスト問題を生成する。
// 既存の BedrockRagTutor と同じ基盤（Knowledge Base 検索 + Converse 生成 + 教材限定ガードレール）を流用し、
// 出力を「回答」ではなく「検証済みの問題JSON」にする。
//
// ガバナンス（QUIZ_AI_PLAN.md / docs/ai-integration.md）:
//   - 検索対象は materials/info2/ 配下の承認済み教材S3キーのみ（他バケット/他キー/非テキストは破棄）。
//   - 生成はその章から取得したチャンク本文だけを根拠にする。
//   - 生成JSONは許可リスト・スキーマで厳格に検証し、不正なものは破棄（公開しない）。
//   - 生成物は下書き（未承認）として返す。承認フローを経るまで出題対象にしない。

import { BedrockAgentRuntimeClient, RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockRuntimeClient, ConverseCommand, type ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { materialFiles } from './material-access';
import { bedrockClientConfig } from './bedrock-client-config';
import type { BedrockRagConfig } from './bedrock-ai-provider';
import {
  buildQuizUserMessage,
  parseGeneratedQuestions,
  quizGenerationSystemPrompt,
  QUIZ_CHAPTER_TITLES,
  type GeneratedQuestion,
} from './quiz-generation';

// 生成された下書き問題。承認フローへ渡す前の中間表現（正解・解説・出典を含む）。
export interface DraftQuizQuestion {
  format: GeneratedQuestion['format'];
  prompt: string;
  choices: string[];
  // correctAnswer は choices に対応する選択肢ID（a,b,c...）。ApprovedQuestion と同じ表現。
  correctAnswer: string[];
  explanation: string;
  conceptTag: string;
  chapter: number;
  citations: string[];
}

export interface QuizGenerationResult {
  status: 'GENERATED' | 'INSUFFICIENT' | 'ERROR';
  chapter: number;
  questions: DraftQuizQuestion[];
  model: string;
  reasonCode?: string;
}

const CHOICE_LETTERS = 'abcdefghij';

function responseText(response: ConverseCommandOutput): string {
  return (response.output?.message?.content ?? [])
    .flatMap((block) => (typeof block.text === 'string' ? [block.text] : []))
    .join('')
    .trim();
}

function pageNumber(value: unknown): string | undefined {
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number > 0 ? String(number) : undefined;
}

export class BedrockQuizGenerator {
  constructor(
    private readonly config: BedrockRagConfig,
    private readonly agentRuntime = new BedrockAgentRuntimeClient(bedrockClientConfig()),
    private readonly runtime = new BedrockRuntimeClient(bedrockClientConfig()),
  ) {}

  // 章タイトルを検索クエリにして、その章に属する承認済み教材チャンクを取得する。
  // BedrockRagTutor.retrieve と同じ S3キー許可リストで、承認外・他バケットを除外する。
  private async retrieveChapter(chapter: number): Promise<{ text: string; citation: string }[]> {
    const query = `情報Ⅱ 第${chapter}章 ${QUIZ_CHAPTER_TITLES[chapter] ?? ''}`.trim();
    const response = await this.agentRuntime.send(
      new RetrieveCommand({
        knowledgeBaseId: this.config.knowledgeBaseId,
        retrievalQuery: { text: query },
        retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: this.config.maxResults } },
      }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
    const prefix = `s3://${this.config.materialsBucketName}/materials/info2/`;
    // 当該章のファイルだけに絞る（materialFiles は ii-N → ファイル名の対応）。
    const chapterFiles = materialFiles[`ii-${chapter}`] ?? [];
    const allowed = new Set(chapterFiles.map((file) => prefix + file));
    return (response.retrievalResults ?? [])
      .slice(0, this.config.maxResults)
      .flatMap((result) => {
        const uri = result.location?.s3Location?.uri;
        const content = result.content?.text?.trim();
        if (!uri || !allowed.has(uri) || !content) return [];
        const metadata = result.metadata ?? {};
        const page = pageNumber(metadata['x-amz-bedrock-kb-document-page-number'] ?? metadata.page);
        const fileName = uri.slice(prefix.length);
        return [{ text: content, citation: `${fileName} / ${page ? 'PDF ' + page + 'ページ' : 'ページ番号未取得'}` }];
      });
  }

  private async generate(chapter: number, count: number, materials: { text: string }[]): Promise<string> {
    const response = await this.runtime.send(
      new ConverseCommand({
        modelId: this.config.modelId,
        system: [{ text: quizGenerationSystemPrompt }],
        messages: [{ role: 'user', content: [{ text: buildQuizUserMessage({ chapter, count }, materials) }] }],
        // 出題のばらつき（難易度ランダム）のため temperature はやや高め。JSON厳格検証で安全性は担保する。
        inferenceConfig: { maxTokens: 1500, temperature: 0.7 },
      }),
      { abortSignal: AbortSignal.timeout(30000) },
    );
    return responseText(response);
  }

  // 指定章の問題を count 問生成する。教材が取得できない/生成が不正なら問題を一切通さない。
  async generateForChapter(chapter: number, count = 3): Promise<QuizGenerationResult> {
    const failure = (status: 'INSUFFICIENT' | 'ERROR', reasonCode: string): QuizGenerationResult => ({
      status,
      chapter,
      questions: [],
      model: this.config.modelId,
      reasonCode,
    });
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > 5) return failure('ERROR', 'invalid-chapter');

    const chunks = await this.retrieveChapter(chapter);
    if (chunks.length === 0) return failure('INSUFFICIENT', 'no-approved-materials');

    const raw = await this.generate(chapter, count, chunks.map((chunk) => ({ text: chunk.text })));
    const generated = parseGeneratedQuestions(raw);
    if (generated.length === 0) return failure('INSUFFICIENT', 'invalid-generation');

    // 教材チャンクの出典をまとめて付与する（AIには出典を生成させず、アプリ側で付ける）。
    const citations = [...new Set(chunks.map((chunk) => chunk.citation))];
    const questions: DraftQuizQuestion[] = generated.map((question) => ({
      format: question.format,
      prompt: question.prompt,
      choices: question.choices,
      correctAnswer: [CHOICE_LETTERS[question.correctIndex]],
      explanation: question.explanation,
      conceptTag: question.conceptTag,
      chapter,
      citations,
    }));
    return { status: 'GENERATED', chapter, questions, model: this.config.modelId };
  }
}
