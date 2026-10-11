'use strict';
const endpoints=require('../../contracts/endpoints');
const {AppError}=require('../../shared/errors');
// B担当の差し替え入口。メソッド一覧・ctx・入出力型はcontractsとHANDOFF_B.mdを参照。
// AWS SDK等の実装はこのファイルから別モジュールに分けて呼び出してよい。
module.exports=function createBService({getC}) {
 const service={};
 for(const name of [...new Set(endpoints.filter(e=>e[3]==='B').map(e=>e[4])),'authenticate','getStudyContext']) {
  service[name]=async(ctx)=>{
   // TODO(B): Cognito/所属DB、DynamoDB/S3、評価、利用枠を実装する。
   // 内部API-13: await getC().getApprovedQuestion({question_id,version,approval_scope,...})
   throw new AppError(503,'B_NOT_CONNECTED',`B担当の${name}は未接続です。`);
  };
 }
 return service;
};
