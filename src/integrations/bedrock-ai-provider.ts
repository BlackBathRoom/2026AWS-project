// 担当C領域: Bedrock Knowledge Base による教材限定 RAG と Bedrock 生成を実装する。
// 仕様書「AIガバナンス・回答制御仕様」に従い、承認済み教材KBのみを検索し、
// 根拠充足判定・範囲外制御・response_type構造化・出典必須を強制する。
//
// この実装は AI worker Lambda(src/ai-worker.ts) から利用される。
// B側の認可・利用枠ゲートを通過したジョブに対してのみ呼ばれる前提。

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';
import { InternalStudyContext } from '../contracts/study-context';
import {
  RetrievedChunk,
  RequestedAction,
  ResponseStatus,
  ResponseType,
  assessGrounding,
  defaultThresholds,
  formatCitations,
  guidanceMessage,
  resolveResponseType,
  type GroundingThresholds,
} from './rag-governance';

export interface TutorGenerationResult {
  status: ResponseStatus;
  responseType: ResponseType;
  message: string;
  citations: string[];
  model: string;
  reasonCode?: string;
}

export interface TutorGenerationRequest {
  question: string;
  context: InternalStudyContext;
  requestedAction: RequestedAction;
}

export interface BedrockRagConfig {
  /** Bedrock Knowledge Base ID (承認済み教材データセット)。 */
  knowledgeBaseId: string;
  /** 生成に使う Bedrock モデル ID。 */
  modelId: string;
  /** Retrieve で取得する最大チャンク数。 */
  maxResults: number;
  thresholds: GroundingThresholds;
}

export function bedrockConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BedrockRagConfig {
  const knowledgeBaseId = env.BEDROCK_KNOWLEDGE_BASE_ID;
  const modelId = env.BEDROCK_MODEL_ID;
  if (!knowledgeBaseId || !modelId) {
    throw new Error('Bedrock configuration is incomplete: BEDROCK_KNOWLEDGE_BASE_ID and BEDROCK_MODEL_ID are required');
  }
  return {
    knowledgeBaseId,
    modelId,
    maxResults: Number(env.BEDROCK_MAX_RESULTS ?? 5),
    thresholds: {
      minChunks: Number(env.BEDROCK_MIN_CHUNKS ?? defaultThresholds.minChunks),
      minScore: Number(env.BEDROCK_MIN_SCORE ?? defaultThresholds.minScore),
      outOfScopeMaxScore: Number(env.BEDROCK_OUT_OF_SCOPE_MAX_SCORE ?? defaultThresholds.outOfScopeMaxScore),
    },
  };
}

/** 回答本文を生成する種別か (SUPPORTED かつ NO_ANSWER 以外)。 */
function producesBody(responseType: ResponseType): boolean {
  return responseType !== 'NO_ANSWER' && responseType !== 'GUIDANCE';
}

/**
 * Bedrock による教材限定 RAG チューター。
 * `AiTutorProvider` の非同期ジョブ本体を担う生成ロジックを提供する。
 */
export class BedrockRagTutor {
  constructor(
    private readonly config: BedrockRagConfig,
    private readonly agentRuntime = new BedrockAgentRuntimeClient({}),
    private readonly runtime = new BedrockRuntimeClient({}),
  ) {}

  /** 承認済み教材KBのみを検索する (仕様書 G-001: KBを承認済みデータセットに限定)。 */
  async retrieve(question: string): Promise<RetrievedChunk[]> {
    const response = await this.agentRuntime.send(
      new RetrieveCommand({
        knowledgeBaseId: this.config.knowledgeBaseId,
        retrievalQuery: { text: question },
        retrievalConfiguration: {
          vectorSearchConfiguration: { numberOfResults: this.config.maxResults },
        },
      }),
    );
    const results = response.retrievalResults ?? [];
    return results.map((result, index) => {
      const metadata = (result.metadata ?? {}) as Record<string, unknown>;
      const sourceId = String(metadata.source_id ?? metadata.sourceId ?? result.location?.s3Location?.uri ?? `source-${index}`);
      return {
        chunkId: String(metadata.chunk_id ?? metadata.chunkId ?? `chunk-${index}`),
        sourceId,
        score: result.score ?? 0,
        content: result.content?.text ?? '',
        citation: {
          sourceId,
          chapter: metadata.chapter ? String(metadata.chapter) : undefined,
          lesson: metadata.lesson ? String(metadata.lesson) : undefined,
          page: metadata.page ? String(metadata.page) : undefined,
        },
      };
    });
  }

  /** 教材チャンクのみを根拠に Bedrock で本文を生成する。外部知識の追加を禁止する。 */
  private async generate(
    request: TutorGenerationRequest,
    responseType: ResponseType,
    chunks: RetrievedChunk[],
  ): Promise<string> {
    const materials = chunks
      .map((chunk, index) => `【根拠${index + 1} 出典:${chunk.citation.sourceId}】\n${chunk.content}`)
      .join('\n\n');

    const system = [
      'あなたは情報Ⅱ学習者を支援する教材限定AIチューターです。',
      '以下の教材根拠だけを使って回答し、教材に無い外部知識・一般知識で補完してはいけません。',
      'response_type の指示に厳密に従ってください。',
      'GUIDANCE/HINT: 答えそのものは示さず、着目点や考え方を短く促す。',
      'EXAMPLE: 教材の範囲を逸脱しない具体例で説明する。',
      'EXPLANATION: 教材内容を平易に整理して説明する(定義+関係+注意点)。',
      'ANSWER: 最終的な答えと理由を示す。ただし評価モードでは使用しない。',
      '教材根拠で質問に答えられない場合は、その旨だけを述べて推測しないこと。',
    ].join('\n');

    const user = [
      `response_type: ${responseType}`,
      `学習モード: ${request.context.mode}`,
      `質問: ${request.question}`,
      '',
      '教材根拠:',
      materials,
    ].join('\n');

    const messages: Message[] = [{ role: 'user', content: [{ text: user }] }];
    const response = await this.runtime.send(
      new ConverseCommand({
        modelId: this.config.modelId,
        system: [{ text: system }],
        messages,
        inferenceConfig: { maxTokens: 800, temperature: 0.2 },
      }),
    );
    const text = response.output?.message?.content?.find((block) => 'text' in block)?.text;
    return text?.trim() ?? '';
  }

  /** ジョブ1件分の RAG 回答を生成する。ガバナンス判定込み。 */
  async answer(request: TutorGenerationRequest): Promise<TutorGenerationResult> {
    const chunks = await this.retrieve(request.question);
    const grounding = assessGrounding(chunks, this.config.thresholds);
    const { responseType, status } = resolveResponseType({
      requestedAction: request.requestedAction,
      mode: request.context.mode,
      allowAnswer: request.context.allowAnswer,
      grounding: grounding.status,
    });

    // 根拠不足・範囲外は本文を生成せず案内文のみ (G-004)。
    if (status !== 'SUPPORTED') {
      return {
        status,
        responseType,
        message: guidanceMessage(status),
        citations: [],
        model: this.config.modelId,
        reasonCode: grounding.reason,
      };
    }

    const body = await this.generate(request, responseType, grounding.supportingChunks);
    const citations = formatCitations(grounding.supportingChunks);

    // SUPPORTED で本文を出す種別なのに本文も出典も無い場合は安全側で抑止 (G-005: 100%出典付き)。
    if (producesBody(responseType) && (body.length === 0 || citations.length === 0)) {
      return {
        status: 'INSUFFICIENT',
        responseType: 'NO_ANSWER',
        message: guidanceMessage('INSUFFICIENT'),
        citations: [],
        model: this.config.modelId,
        reasonCode: 'empty-generation-or-missing-citation',
      };
    }

    return {
      status: 'SUPPORTED',
      responseType,
      message: body,
      citations,
      model: this.config.modelId,
    };
  }
}
