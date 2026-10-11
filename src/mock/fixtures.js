'use strict';
// 接続確認だけの課題。公的教材本文・監修済み問題を装わない。
const catalog=require('../../public/data/catalog.json');
function assignment(unit){return {assignment_id:'assignment-'+unit.unit_id,version:1,unit_id:unit.unit_id,title:unit.title+'：指導課題（接続確認用）',rubric_version:'fixture-1',mode:'learning',aid_policy:{ai_allowed:true,allow_answer:false},required_outputs:[{key:'practice',label:'実践課題',description:'教材を読んで実践した内容を記録してください。'},{key:'explanation',label:'生徒への説明',description:'選択した章の内容を生徒向けに説明してください。'},{key:'diagnosis',label:'つまずき診断',description:'想定する誤答と、その理由・支援を記録してください。'},{key:'lesson',label:'授業案',description:'目標・活動・理解確認を記録してください。'}],rubric:{K:'知識理解',P:'実践',E:'説明',D:'つまずき診断',L:'授業設計'},scale:{0:'重大な誤解・未達',1:'支援が必要',2:'自力で基本を実行',3:'状況に応じて改善'},fixture:true};}
function getAssignment(id){const u=catalog.units.find(u=>'assignment-'+u.unit_id===id);return u?assignment(u):null;}
function question(lesson,index=0){return {question_id:lesson+'-fixture-'+index,version:1,lesson_id:lesson,concept_id:lesson+'-fixture',format:index%2?'TRUE_FALSE':'CHOICE',prompt:'【接続確認用・教材問題ではありません】画面に表示された章と原典の章を照合します。出典として確認するものを選んでください。',choices:[{id:'a',text:'教材の出典・章・版'},{id:'b',text:'根拠のない推測'}],answer:'a',explanation:'接続確認用の固定解説です。C担当が監修済み問題に差し替えます。',status:'APPROVED',source_id:'fixture-source'};}
module.exports={assignment,getAssignment,question};
