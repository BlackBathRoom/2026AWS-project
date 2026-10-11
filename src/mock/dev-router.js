'use strict';
const express=require('express');const {randomUUID}=require('node:crypto');
const {AppError}=require('../shared/errors');
module.exports=services=>{
 const r=express.Router(),s=services.state;
 r.use((req,res,next)=>{res.set('Cache-Control','no-store');const o=req.get('origin');if(o&&o!==`${req.protocol}://${req.get('host')}`)return next(new AppError(403,'ORIGIN','別サイトから操作できません。'));next();});
 r.post('/session',(req,res,next)=>{const u=s.users[req.body.user_id];if(!u||u.user_id==='outsider')return next(new AppError(422,'USER','役割を選択してください。'));const token=randomUUID();s.sessions.set(token,u.user_id);res.cookie('mock_session',token,{httpOnly:true,sameSite:'strict',path:'/',secure:req.secure});res.json({status:'OK'});});
 r.delete('/session',(req,res)=>{const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('mock_session='));s.sessions.delete(cookie?.slice(13));res.clearCookie('mock_session',{path:'/'}).json({status:'OK'});});
 r.put('/uploads/:token',express.raw({type:'application/octet-stream',limit:'2mb'}),async(req,res,next)=>{try{const user=await services.B.authenticate({headers:req.headers});const f=[...s.files.values()].find(x=>x.token===req.params.token&&x.owner_id===user.user_id&&x.organization_id===user.organization_id);if(!f||f.expires_at<Date.now())throw new AppError(404,'UPLOAD_EXPIRED','アップロード先の期限が切れています。');if(s.submissions.get(f.submission_id)?.status!=='DRAFT'||f.status!=='PENDING')throw new AppError(409,'UPLOAD_CLOSED','アップロードは終了しています。');if(!Buffer.isBuffer(req.body)||req.body.length!==f.size)throw new AppError(422,'SIZE_MISMATCH','サイズが一致しません。');f.bytes=req.body;res.json({status:'UPLOADED'});}catch(e){next(e);}});
 return r;
};
