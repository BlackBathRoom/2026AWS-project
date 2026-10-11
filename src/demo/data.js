'use strict';
// 画面確認専用の架空データ。教科監修・教材承認・公的な評価基準を表さない。
const users = [
  { id: 'teacher', name: '受講教員・デモ', role: 'teacher', school: 'サンプル学校', training: '情報Ⅱ・デモ研修' },
  { id: 'reviewer', name: '評価者・デモ', role: 'reviewer', school: 'サンプル学校', training: '情報Ⅱ・デモ研修' },
  { id: 'manager', name: '教材管理者・デモ', role: 'manager', school: 'サンプル学校', training: '情報Ⅱ・デモ研修' },
  { id: 'admin', name: '運用管理者・デモ', role: 'admin', school: 'サンプル学校', training: '情報Ⅱ・デモ研修' },
];
const axes = [ ['K', '知識理解'], ['P', '実践'], ['E', '説明'], ['D', 'つまずき診断'], ['L', '授業設計'] ];
const materials = [
  { id: 'm1', title: 'データの関係を読み解く', subject: '情報Ⅱ', unit: 'データサイエンス', chapter: 'デモ第1章', page: '1–2', version: 1, status: 'PUBLISHED', source: '画面確認用の自作教材（未監修）', text: '散布図では、横軸と縦軸に2つの変数を取り、対応する値を点で表します。点の並び方から関係を観察します。\n\n相関は2つの変数が共に変化する傾向です。相関が見られても、一方が他方を引き起こすとは限りません。別の要因が両方に影響している場合もあります。\n\n授業では「アイスの売上と熱中症の件数」を例に、気温という共通の要因を考えてもらいます。', related: '情報Ⅰの平均・中央値・グラフの読み方を復習しましょう。' },
  { id: 'm2', title: '平均値と中央値の使い分け', subject: '情報Ⅰ', unit: '前提知識の補強', chapter: 'デモ補強章', page: '1', version: 1, status: 'PUBLISHED', source: '画面確認用の自作教材（未監修）', text: '平均値は合計を個数で割った値です。中央値は値を並べたときの中央の値です。極端に大きい値や小さい値があると平均値はその影響を受けます。分布や目的に合わせて代表値を選びます。', related: '情報Ⅱのデータ分析に戻り、データの特徴を説明してみましょう。' },
];
// 正解・解説はサーバーのみ。問題取得APIではanswer/explanationを除外する。
const questions = [
  { id: 'q1', version: 1, prompt: '2つの変数に相関が見られたとき、適切な説明はどれですか？', options: ['必ず因果関係がある', '共通の別要因が影響している可能性もある', '必ず偶然である'], answer: 1, explanation: '相関だけでは因果関係を確定できません。別の要因も検討します。', tag: '相関と因果', materialId: 'm1' },
  { id: 'q2', version: 1, prompt: '2つの量の関係を点の分布から観察するグラフは？', options: ['散布図', '円グラフ', '帯グラフ'], answer: 0, explanation: '散布図では対応する2変数の値を点として表示します。', tag: '散布図', materialId: 'm1' },
  { id: 'q3', version: 1, prompt: '極端に大きい値が1つあるデータで、その影響を受けにくい代表値は？', options: ['合計', '平均値', '中央値'], answer: 2, explanation: '中央値は順序に基づくため、極端な値の大きさの影響を受けにくい代表値です。', tag: '情報Ⅰ・代表値', materialId: 'm2' },
];
module.exports = { users, axes, materials, questions };
