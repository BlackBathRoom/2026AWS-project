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
  { chapter: 5, prompt: 'モデル化とシミュレーションの関係として正しいものはどれか。', choices: ['モデル化した対象を使って試行・分析することがシミュレーションである', 'シミュレーションの後に初めてモデル化を行う', '両者は全く無関係である'], correctIndex: 0 },

  // --- 追加分（多様性を高めるため各章を増量） ---
  // 第1章 情報社会の進展と情報技術
  { chapter: 1, prompt: '情報を無断で複製・配布することから保護する権利はどれか。', choices: ['肖像権', '著作権', '所有権'], correctIndex: 1 },
  { chapter: 1, prompt: 'AI（人工知能）の活用例として最も適切なものはどれか。', choices: ['画像から対象を自動認識する', '紙の書類を物理的に綴じる', '電源ケーブルを配線する'], correctIndex: 0 },
  { chapter: 1, prompt: '情報技術の進展がもたらす「デジタルデバイド」とは何か。', choices: ['情報機器の処理速度の限界', '情報を活用できる人とできない人の格差', 'データが分割されて保存される仕組み'], correctIndex: 1 },
  { chapter: 1, prompt: 'クラウドサービスの特徴として正しいものはどれか。', choices: ['必ず自分の端末内だけで処理する', 'ネットワーク経由で遠隔のサーバー資源を利用する', '電力を使わず動作する'], correctIndex: 1 },
  { chapter: 1, prompt: '個人情報を取り扱う際の配慮として適切でないものはどれか。', choices: ['利用目的を明確にする', '本人の同意なく第三者へ提供する', '安全管理措置を講じる'], correctIndex: 1 },

  // 第2章 コミュニケーションとコンテンツ
  { chapter: 2, prompt: '色の三原色（光の加法混色）に含まれないものはどれか。', choices: ['赤（R）', '緑（G）', '黄（Y）'], correctIndex: 2 },
  { chapter: 2, prompt: '非可逆圧縮がよく使われるデータはどれか。', choices: ['プログラムのソースコード', '写真や音声', '表計算の数値データ'], correctIndex: 1 },
  { chapter: 2, prompt: '標本化の周波数を高くすると一般にどうなるか。', choices: ['音質は原音に近づくがデータ量は増える', 'データ量は変わらない', '必ず音質が劣化する'], correctIndex: 0 },
  { chapter: 2, prompt: '情報デザインで「アクセシビリティ」が意味するものはどれか。', choices: ['誰もが情報を利用しやすいこと', '画面を派手に装飾すること', '通信速度を上げること'], correctIndex: 0 },
  { chapter: 2, prompt: '1バイトは何ビットか。', choices: ['4ビット', '8ビット', '16ビット'], correctIndex: 1 },

  // 第3章 情報とデータサイエンス
  { chapter: 3, prompt: 'データの散らばりの大きさを表す指標はどれか。', choices: ['標準偏差', '中央値', '最頻値'], correctIndex: 0 },
  { chapter: 3, prompt: '「相関があること」と「因果があること」の関係として正しいものはどれか。', choices: ['相関があれば必ず因果がある', '相関があっても因果があるとは限らない', '因果があっても相関は生じない'], correctIndex: 1 },
  { chapter: 3, prompt: '欠損値（データの抜け）への対応として適切でないものはどれか。', choices: ['補完方法を検討する', '欠損があることを記録する', '気づかないふりをして無視し改ざんする'], correctIndex: 2 },
  { chapter: 3, prompt: '度数分布を視覚的に表すのに適したグラフはどれか。', choices: ['ヒストグラム', '円グラフ1枚だけ', '折れ線1本だけ'], correctIndex: 0 },
  { chapter: 3, prompt: '教師あり学習の説明として正しいものはどれか。', choices: ['正解ラベル付きデータで学習する', 'データを一切使わずに学習する', '正解を人が一切与えずに分類のみ行う'], correctIndex: 0 },

  // 第4章 情報システムとプログラミング
  { chapter: 4, prompt: '10進数の 5 を2進数で表した値はどれか。', choices: ['101', '110', '111'], correctIndex: 0 },
  { chapter: 4, prompt: '変数の説明として最も適切なものはどれか。', choices: ['値を入れておく名前付きの入れ物', '画面の明るさの単位', '通信回線の種類'], correctIndex: 0 },
  { chapter: 4, prompt: '条件によって処理を分ける制御構造はどれか。', choices: ['順次', '分岐（選択）', '反復'], correctIndex: 1 },
  { chapter: 4, prompt: '関数（手続き）を使う利点として正しいものはどれか。', choices: ['同じ処理を再利用でき見通しが良くなる', '必ず実行速度が無限に速くなる', 'バグが絶対に発生しなくなる'], correctIndex: 0 },
  { chapter: 4, prompt: 'アルゴリズムの説明として最も適切なものはどれか。', choices: ['問題を解くための手順', 'コンピュータの部品名', '画面の解像度'], correctIndex: 0 },

  // 第5章 情報と情報技術を活用した問題発見・解決の探究
  { chapter: 5, prompt: 'ブレーンストーミングのルールとして適切なものはどれか。', choices: ['他者の意見を批判しない', '必ず1案に早く絞る', '発言は1人だけが行う'], correctIndex: 0 },
  { chapter: 5, prompt: '問題解決で「評価」を行う目的として正しいものはどれか。', choices: ['結果を振り返り次の改善につなげる', '作業をすぐ終わらせる', '記録を残さないようにする'], correctIndex: 0 },
  { chapter: 5, prompt: 'データに基づいて意思決定することの利点はどれか。', choices: ['根拠をもって判断しやすくなる', '勘だけで決められる', '記録が不要になる'], correctIndex: 0 },
  { chapter: 5, prompt: 'シミュレーションの利点として適切なものはどれか。', choices: ['実際に試すと危険・高コストな事象を安全に検討できる', '現実を完全に100%再現できる', '前提条件を考えなくてよい'], correctIndex: 0 },
  { chapter: 5, prompt: '探究活動で情報を収集する際に重要なことはどれか。', choices: ['出典や信頼性を確認する', '最初に見つけた情報だけを使う', '情報源を一切記録しない'], correctIndex: 0 },
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
