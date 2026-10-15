'use strict';
const express=require('express');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const endpoints=require('./contracts/endpoints');
const createServices=require('./services/create-services');
const {AppError}=require('./shared/errors');
function createApp(options={}) {
 const mode=options.mode||process.env.APP_MODE||(process.env.NODE_ENV==='production'?'live':'mock');
 if(!['mock','live'].includes(mode)) throw new Error('APP_MODE must be mock or live');
 if(process.env.NODE_ENV==='production' && mode==='mock') throw new Error('本番環境ではmockを利用できません。');
 const services=options.services||createServices(mode);
 const app=express(); app.disable('x-powered-by');
 const apiBase=process.env.API_BASE_URL||'/v1';
 const uploadOrigins=(process.env.UPLOAD_ORIGINS||'').split(',').filter(Boolean).map(value=>{const u=new URL(value);if(u.protocol!=='https:')throw new Error('UPLOAD_ORIGINS must use HTTPS');return u.origin;});
 let connect="'self'"+(uploadOrigins.length?' '+uploadOrigins.join(' '):'');
 if(apiBase!=='/v1') { const url=new URL(apiBase); if(url.protocol!=='https:') throw new Error('API_BASE_URL must use HTTPS'); connect+=' '+url.origin; }
 app.use((req,res,next)=>{ req.requestId=randomUUID(); res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'self'; script-src 'self'; style-src 'self'; connect-src ${connect}; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`}); next(); });
 app.get('/health',(_req,res)=>res.json({status:'ok'}));
 app.get('/runtime-config.js',(_req,res)=>res.type('js').set('Cache-Control','no-store').send(`window.RUNTIME_CONFIG=${JSON.stringify({mode,api_base:apiBase,upload_origins:uploadOrigins})};`));
 app.use(express.json({limit:'3mb'}));
 const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
 if(mode==='mock') app.use('/dev',require('./mock/dev-router')(services));
 app.use('/v1', (req,res,next)=>{res.set('Cache-Control','no-store');next();});
 for(const [specId,method,route,owner,operation,status] of endpoints) {
  app[method]('/v1'+route,wrap(async(req,res)=>{
   if(method!=='get' && !req.is('application/json')) throw new AppError(415,'JSON_REQUIRED','JSONで送信してください。');
   if(mode==='mock' && method!=='get') {
    const origin=req.get('origin');
    if(origin && origin!==`${req.protocol}://${req.get('host')}`) throw new AppError(403,'ORIGIN','別サイトからの操作を拒否しました。');
   }
   const user=await services.B.authenticate({headers:req.headers,request_id:req.requestId});
   const ctx={user,params:req.params,query:req.query,body:req.body||{},idempotency_key:req.get('Idempotency-Key'),request_id:req.requestId,spec_id:specId};
   const result=await services[owner][operation](ctx);
   res.status(status).json(result);
  }));
 }
 app.use('/v1',(_req,_res,next)=>next(new AppError(404,'NOT_FOUND','未定義のAPIです。')));
 app.use(express.static(path.join(__dirname,'../public')));
 app.use((err,req,res,_next)=>{
  const known=err instanceof AppError;
  const status=known?err.status:err.status===413?413:err.status===400?400:500;
  res.status(status).json({error:{code:known?err.code:'REQUEST_ERROR',message:known?err.message:status===413?'サイズ上限を超えています。':'処理できませんでした。',request_id:req.requestId}});
 });
 app.locals.services=services;
 return app;
}
module.exports={createApp};
