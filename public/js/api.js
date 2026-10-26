import {auth} from './auth.js';
export class ApiError extends Error {constructor(status,code,message,request_id){super(message);Object.assign(this,{status,code,request_id});}}
export async function api(path,{method='GET',body,key,signal}={}){
 const token=await auth.getAccessToken();const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;if(body!==undefined)headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
 const response=await fetch(window.RUNTIME_CONFIG.api_base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal,credentials:window.RUNTIME_CONFIG.mode==='mock'?'same-origin':'omit'});
 const raw=await response.text();let data;try{data=raw?JSON.parse(raw):null;}catch{throw new ApiError(response.status,'INVALID_RESPONSE','APIからJSON以外の応答を受信しました。起動先とAPI設定を確認してください。');}if(!response.ok){const e=data?.error||data||{};throw new ApiError(response.status,e.code,e.message||'通信に失敗しました。',e.requestId||e.request_id);}return data;
}
// 通信エラーでの再送は同じキー。同じ操作でも内容を変更した場合は新しいキー。
export function mutation(){let previous,key;return async(path,body,method='POST')=>{const fingerprint=JSON.stringify([path,body,method]);if(previous!==fingerprint){previous=fingerprint;key=crypto.randomUUID();}const result=await api(path,{method,body,key});previous=undefined;return result;};}
export async function uploadFile(target,file){
 const url=new URL(target,location.origin);const allowed=window.RUNTIME_CONFIG.upload_origins||[];
 if(!(url.origin===location.origin&&url.pathname.startsWith('/dev/uploads/')&&window.RUNTIME_CONFIG.mode==='mock')&&!(url.protocol==='https:'&&allowed.includes(url.origin)))throw new Error('アップロード先が許可されていません。B担当のUPLOAD_ORIGINS設定を確認してください。');
 const response=await fetch(url,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:file,credentials:url.origin===location.origin?'same-origin':'omit'});if(!response.ok)throw new Error('ファイルをアップロードできませんでした。');
}
export async function waitForAI(job,signal,started=Date.now()){
 const deadline=started+30000;
 while(Date.now()<deadline){
  await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'));};const t=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},Math.min(2000,Math.max(0,deadline-Date.now())));if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});});
  const r=await api('/tutor/jobs/'+encodeURIComponent(job.job_id),{signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(Math.max(1,deadline-Date.now()))])});
  if(r.status==='SUCCEEDED')return validateResult(r.result);
  if(['FAILED','TIMEOUT'].includes(r.status))throw new Error(r.status==='TIMEOUT'?'AI処理が時間切れになりました。':'AI処理に失敗しました。');
  if(!['QUEUED','RUNNING'].includes(r.status))throw new Error('未定義のAI処理状態を受信しました。');
 }
 throw new Error('30秒以内に回答を取得できませんでした。教材を利用してください。');
}
export function validateResult(r){
 if(!r||!['SUPPORTED','INSUFFICIENT','OUT_OF_SCOPE','ERROR','UNAVAILABLE'].includes(r.status)||!['GUIDANCE','HINT','EXAMPLE','EXPLANATION','ANSWER'].includes(r.response_type)||typeof r.message!=='string'||!Array.isArray(r.citations))throw new Error('AI回答の形式が仕様と一致しません。');
 if(r.status==='SUPPORTED'&&!r.citations.length)throw new Error('根拠のない回答を受信したため表示できません。');
 if(r.citations.some(c=>!c.source_id||c.version==null||c.page==null||!c.chunk_id))throw new Error('出典情報が不足しています。');
 return r;
}
