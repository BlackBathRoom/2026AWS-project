// 仕様書「AIガバナンス・回答制御仕様」(G-001〜G-012) と「状態/response_type」表を
// プロバイダー非依存の純粋ロジックとして実装する。Bedrock呼び出しの前後でこの判定を使い、
// 教材限定・根拠充足・範囲外制御・出典必須を強制する。

import { StudyMode } from '../contracts/study-context';

/** 仕様書「状態」列。SUPPORTED系のみ回答本文を生成し、他は本文生成を抑止する。 */
export type ResponseStatus = 'SUPPORTED' | 'INSUFFICIENT' | 'OUT_OF_SCOPE' | 'ERROR' | 'UNAVAILABLE';

/** 仕様書 G-003「response_typeを構造化」。援助ポリシーに応じて許可する種別が変わる。 */
export type ResponseType =
  | 'GUIDANCE'
  | 'HINT'
  | 'EXAMPLE'
  | 'EXPLANATION'
  | 'ANSWER'
  | 'NO_ANSWER';

export type RequestedAction = 'hint' | 'explanation' | 'example' | 'answer';

/** Knowledge Base から取得した教材チャンク。score は検索関連度。 */
export interface RetrievedChunk {
  chunkId: string;
  sourceId: string;
  score: number;
  content: string;
  /** 仕様書 G-005 の引用メタデータ: 章・学習・ページ・教材ID。 */
  citation: { sourceId: string; chapter?: string; lesson?: string; page?: string };
}

/** 根拠充足判定(G-002)の閾値。組織やモデルに応じて調整可能にする。 */
export interface GroundingThresholds {
  /** SUPPORTED と判定するのに必要な最小チャンク数。 */
  minChunks: number;
  /** 各チャンクに求める最小関連スコア。 */
  minScore: number;
  /** 範囲外(OUT_OF_SCOPE)と判定する上限スコア。これ以下は教材に関連記載なしとみなす。 */
  outOfScopeMaxScore: number;
}

export const defaultThresholds: GroundingThresholds = {
  minChunks: 1,
  minScore: 0.5,
  outOfScopeMaxScore: 0.2,
};

/**
 * 根拠充足判定 (仕様書 G-002 / G-004 / F-010)。
 * - 関連チャンクが全く無い、または全て OUT_OF_SCOPE 閾値以下 → OUT_OF_SCOPE
 * - 関連はあるが充足条件(件数・スコア)を満たさない → INSUFFICIENT
 * - 充足条件を満たす → SUPPORTED
 */
export function assessGrounding(
  chunks: RetrievedChunk[],
  thresholds: GroundingThresholds = defaultThresholds,
): { status: 'SUPPORTED' | 'INSUFFICIENT' | 'OUT_OF_SCOPE'; supportingChunks: RetrievedChunk[]; reason: string } {
  const relevant = chunks.filter((chunk) => chunk.score > thresholds.outOfScopeMaxScore);
  if (relevant.length === 0) {
    return { status: 'OUT_OF_SCOPE', supportingChunks: [], reason: '教材内に関連する記載が見つかりませんでした' };
  }
  const supporting = relevant.filter((chunk) => chunk.score >= thresholds.minScore);
  if (supporting.length < thresholds.minChunks) {
    return { status: 'INSUFFICIENT', supportingChunks: supporting, reason: '教材内に関連はありますが質問に十分答えられる根拠が不足しています' };
  }
  return { status: 'SUPPORTED', supportingChunks: supporting, reason: '教材内に十分な根拠が見つかりました' };
}

/**
 * 援助ポリシーと学習モードから、許可される最大の response_type を決める (仕様書 G-003/G-004)。
 * - assessment モードでは ANSWER を禁止 (ai-integration.md: 評価モードで正答を返さない)
 * - assistancePolicy=none では本文援助を抑止し GUIDANCE/NO_ANSWER のみ
 * - allowAnswer=false では ANSWER に降格制御をかける
 */
export function resolveResponseType(input: {
  requestedAction: RequestedAction;
  mode: StudyMode;
  allowAnswer: boolean;
  grounding: 'SUPPORTED' | 'INSUFFICIENT' | 'OUT_OF_SCOPE';
}): { responseType: ResponseType; status: ResponseStatus } {
  // 根拠が無ければ本文を一切生成しない (G-004: 回答本文を生成しない / OUT_OF_SCOPE・INSUFFICIENT を強制)。
  if (input.grounding === 'OUT_OF_SCOPE') {
    return { responseType: 'NO_ANSWER', status: 'OUT_OF_SCOPE' };
  }
  if (input.grounding === 'INSUFFICIENT') {
    return { responseType: 'NO_ANSWER', status: 'INSUFFICIENT' };
  }

  // SUPPORTED の場合、要求アクションを援助ポリシー・モードの制約で降格する。
  const wantsAnswer = input.requestedAction === 'answer';
  const answerAllowed = wantsAnswer && input.mode !== 'assessment' && input.allowAnswer;

  let responseType: ResponseType;
  switch (input.requestedAction) {
    case 'answer':
      responseType = answerAllowed ? 'ANSWER' : 'HINT';
      break;
    case 'explanation':
      responseType = 'EXPLANATION';
      break;
    case 'example':
      responseType = 'EXAMPLE';
      break;
    case 'hint':
    default:
      responseType = 'HINT';
      break;
  }
  return { responseType, status: 'SUPPORTED' };
}

/** 範囲外・不足時のユーザー向け案内文 (仕様書「表示例」列)。 */
export function guidanceMessage(status: ResponseStatus): string {
  switch (status) {
    case 'OUT_OF_SCOPE':
      return 'この教材の範囲外です。関連するメニューから学習を続けてください。';
    case 'INSUFFICIENT':
      return '教材内には十分な記載がありません。関連する学習箇所を確認してください。';
    case 'UNAVAILABLE':
      return '現在AI支援を利用できません。学習は教材と小テストで継続できます。';
    case 'ERROR':
      return 'AI支援の処理に失敗しました。時間をおいて再度お試しください。';
    default:
      return '';
  }
}

/** 引用メタデータを仕様書 G-005 の表示形式 (教材ID/章/学習/ページ) へ整形する。 */
export function formatCitations(chunks: RetrievedChunk[]): string[] {
  const seen = new Set<string>();
  const citations: string[] = [];
  for (const chunk of chunks) {
    const parts = [chunk.citation.sourceId, chunk.citation.chapter, chunk.citation.lesson, chunk.citation.page].filter(
      (value): value is string => Boolean(value),
    );
    const label = parts.join(' / ');
    if (label && !seen.has(label)) {
      seen.add(label);
      citations.push(label);
    }
  }
  return citations;
}
