import { ApprovedQuestion } from '../contracts/backend';
import { asOrganizationId, asRuleVersionId, asTrainingId, ConceptId, QuestionId, QuestionVersionId } from '../contracts/common';

// 章別AI生成小テストの土台となる承認済み問題。
// QUIZ_AI_PLAN.md の方針: 章ごとに承認済み問題から出題し、章別の正答率で到達状況を集計する。
// 難易度は完全ランダム（重み付けなし・各問1点均等）。将来 Bedrock が生成した問題で差し替える。
// 章(chapter 1..5)は materials.json / catalog.json の情報Ⅱ第1〜5章に対応する。
//   1: 情報社会の進展と情報技術
//   2: コミュニケーションとコンテンツ
//   3: 情報とデータサイエンス
//   4: 情報システムとプログラミング
//   5: 情報と情報技術を活用した問題発見・解決の探究

interface QuizSeed {
  chapter: number;
  prompt: string;
  choices: string[]; // 表示順。IDは a,b,c... を自動採番
  correctIndex: number; // 0始まり
}

const CONCEPT_BY_CHAPTER: Record<number, string> = {
  1: 'concept-ch1',
  2: 'concept-ch2',
  3: 'concept-ch3',
  4: 'concept-ch4',
  5: 'concept-ch5',
};

export function conceptIdForChapter(chapter: number): ConceptId {
  return (CONCEPT_BY_CHAPTER[chapter] ?? `concept-ch${chapter}`) as ConceptId;
}

const seeds: QuizSeed[] = [
  // 第1章 情報社会の進展と情報技術
  { chapter: 1, prompt: '情報社会において、個人情報を適切に保護するための法律として最も関係が深いものはどれか。', choices: ['著作権法', '個人情報保護法', '電子署名法'], correctIndex: 1 },
  { chapter: 1, prompt: 'IoT（Internet of Things）の説明として最も適切なものはどれか。', choices: ['人同士がSNSでつながること', 'さまざまな「モノ」がネットワークに接続される仕組み', '紙の書類を電子化すること'], correctIndex: 1 },
  { chapter: 1, prompt: 'ビッグデータの特徴としてよく挙げられる「3V」に含まれないものはどれか。', choices: ['Volume（量）', 'Velocity（速度）', 'Validity（正当性）'], correctIndex: 2 },

  // 第2章 コミュニケーションとコンテンツ
  { chapter: 2, prompt: '画像を構成する最小単位を表す用語はどれか。', choices: ['ピクセル', 'ビットレート', 'サンプリング'], correctIndex: 0 },
  { chapter: 2, prompt: '音声をディジタルデータに変換する際、一定時間ごとに波形の値を読み取る処理を何というか。', choices: ['量子化', '標本化（サンプリング）', '符号化'], correctIndex: 1 },
  { chapter: 2, prompt: '可逆圧縮の説明として正しいものはどれか。', choices: ['圧縮前のデータを完全に復元できる', '必ずファイルサイズが半分になる', '画質が必ず劣化する'], correctIndex: 0 },

  // 第3章 情報とデータサイエンス
  { chapter: 3, prompt: '量的データと質的データの区別として正しいものはどれか。', choices: ['血液型は量的データである', '身長は量的データである', '性別は量的データである'], correctIndex: 1 },
  { chapter: 3, prompt: '2つの変数の関係の強さを -1〜1 の範囲で表す指標はどれか。', choices: ['中央値', '相関係数', '標準偏差'], correctIndex: 1 },
  { chapter: 3, prompt: '外れ値の影響を受けにくい代表値はどれか。', choices: ['平均値', '中央値', '合計値'], correctIndex: 1 },

  // 第4章 情報システムとプログラミング
  { chapter: 4, prompt: '2進数の 1010 を10進数で表した値はどれか。', choices: ['8', '10', '12'], correctIndex: 1 },
  { chapter: 4, prompt: 'プログラムの処理を繰り返し実行する制御構造を何というか。', choices: ['順次', '分岐（選択）', '反復（繰り返し）'], correctIndex: 2 },
  { chapter: 4, prompt: 'APIの説明として最も適切なものはどれか。', choices: ['ソフトウェア同士が機能をやり取りするための接続仕様', 'コンピュータの電源を管理する装置', '画面の解像度を表す単位'], correctIndex: 0 },

  // 第5章 情報と情報技術を活用した問題発見・解決の探究
  { chapter: 5, prompt: '問題解決の一般的な流れとして最も適切な順序はどれか。', choices: ['評価 → 実行 → 計画 → 問題の明確化', '問題の明確化 → 計画 → 実行 → 評価', '実行 → 評価 → 計画 → 問題の明確化'], correctIndex: 1 },
  { chapter: 5, prompt: 'PDCAサイクルの「C」が表すものはどれか。', choices: ['Check（評価・確認）', 'Create（作成）', 'Connect（接続）'], correctIndex: 0 },
  { chapter: 5, prompt: 'モデル化とシミュレーションの関係として正しいものはどれか。', choices: ['モデル化した対象を使って試行・分析することがシミュレーションである', 'シミュレーションの後に初めてモデル化を行う', '両者は全く無関係である'], correctIndex: 2 },
];

const letters = 'abcdefghij';

// すべて school-001 / training-001 に属する承認済み問題として展開する。
export const chapterQuestions: ApprovedQuestion[] = seeds.map((seed, index) => {
  const number = String(index + 1).padStart(3, '0');
  return {
    questionId: `question-ch${seed.chapter}-${number}` as QuestionId,
    version: `question-version-ch${seed.chapter}-${number}` as QuestionVersionId,
    organizationId: asOrganizationId('school-001'),
    trainingId: asTrainingId('training-001'),
    conceptId: conceptIdForChapter(seed.chapter),
    chapter: seed.chapter,
    format: 'single_choice',
    prompt: seed.prompt,
    choices: seed.choices,
    correctAnswer: [letters[seed.correctIndex]],
    approvalStatus: 'APPROVED',
    ruleVersionId: asRuleVersionId('rule-v1'),
  };
});
