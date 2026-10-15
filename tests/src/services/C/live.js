'use strict';
const endpoints=require('../../contracts/endpoints');
const {AppError}=require('../../shared/errors');
// C担当の差し替え入口。正式公開APIと内部API-13を実装する。
module.exports=function createCService({getB}) {
 const service={};
 for(const name of [...new Set(endpoints.filter(e=>e[3]==='C').map(e=>e[4])),'getApprovedQuestion']) {
  service[name]=async(ctx)=>{
   // TODO(C): 教材承認・公開版、KB Retrieve、Bedrock、Guardrails、SQSを接続する。
   // 内部API-12: const context=await getB().getStudyContext(ctx)
   // getApprovedQuestion以外から正解を受講者へ返さない。
   throw new AppError(503,'C_NOT_CONNECTED',`C担当の${name}は未接続です。`);
  };
 }
 return service;
};
