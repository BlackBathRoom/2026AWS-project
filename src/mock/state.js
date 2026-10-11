'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {AppError}=require('../shared/errors');
const catalog=require('../../public/data/catalog.json');
const id=prefix=>prefix+'-'+randomUUID();
const now=()=>new Date().toISOString();
const axes=['K','P','E','D','L'];
function createState(){
 const users=Object.fromEntries(['teacher','reviewer','reviewer2','manager','approver','admin','outsider'].map(role=>[role,{user_id:role,role:role==='reviewer2'?'reviewer':role==='outsider'?'teacher':role,organization_id:role==='outsider'?'org-other':'org-demo',cohort_ids:['cohort-demo'],active:true}]));
 return {users,sessions:new Map(),idem:new Map(),profiles:new Map(),attempts:new Map(),submissions:new Map(),files:new Map(),reviews:new Map(),appeals:new Map(),jobs:new Map(),usage:new Map(),feedback:[],deletions:[],audit:[],edges:new Map(),questions:new Map(),uploads:new Map(),content:new Map(catalog.units.map(u=>[u.lesson_id,{...u,source_id:u.lesson_id,version:1,status:'DRAFT',creator_id:'manager',organization_id:'org-demo'}])),policy:{policy_version:1,ai_enabled:true,allow_answer:false,limits:{daily_jobs:20}},catalog};
}
const owned=(ctx,obj)=>{if(!obj||obj.organization_id!==ctx.user.organization_id||obj.owner_id!==ctx.user.user_id)throw new AppError(404,'NOT_FOUND','対象がありません。');return obj;};
function stable(x){return JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
async function idem(state,ctx,operation,fn){
 if(!ctx.idempotency_key||ctx.idempotency_key.length>200)throw new AppError(422,'IDEMPOTENCY_REQUIRED','Idempotency-Keyが必要です。');
 const key=[ctx.user.organization_id,ctx.user.user_id,operation,ctx.idempotency_key].join('/');
 const hash=createHash('sha256').update(stable({params:ctx.params,body:ctx.body})).digest('hex');
 const old=state.idem.get(key);if(old){if(old.hash!==hash)throw new AppError(409,'IDEMPOTENCY_CONFLICT','同じキーで内容が変更されています。');return structuredClone(await old.promise);}
 const promise=Promise.resolve().then(fn);state.idem.set(key,{hash,promise});
 try{return structuredClone(await promise);}catch(e){state.idem.delete(key);throw e;}
}
module.exports={createState,id,now,axes,owned,idem};
