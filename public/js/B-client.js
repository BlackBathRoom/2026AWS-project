import {api} from './api.js';
// API番号・path・snake_caseは05_データ設計に合わせる。詳細形状はcontracts.md参照。
export const B={me:()=>api('/me'),profile:()=>api('/me/training-profile'),progress:()=>api('/progress'),assignment:id=>api('/training-assignments/'+encodeURIComponent(id)),nextQuiz:(id,mode,retry)=>api('/quiz/next?'+new URLSearchParams({lesson_id:id,mode,...(retry?{retry_of:retry}:{})})),reviews:id=>api('/reviews'+(id?'?assignment_id='+encodeURIComponent(id):'')),analytics:id=>api('/cohorts/'+encodeURIComponent(id)+'/analytics'),file:id=>api('/files/'+encodeURIComponent(id))};
