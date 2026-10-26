import { Router } from 'express';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requireBackendAuth } from '../middleware/mock-auth';

const files: Record<string, string[]> = {
 'ii-0':['00_cover.pdf'], 'ii-1':['01_chapter1.pdf'], 'ii-2':['02_chapter2.pdf'],
 'ii-3':['03_chapter3_part1.pdf','03_chapter3_part2.pdf'],
 'ii-4':['04_chapter4.pdf'], 'ii-5':['05_chapter5.pdf']
};
export const materialRouter = Router();
materialRouter.use('/materials', requireBackendAuth);
materialRouter.get('/materials/:id/view', async (req,res) => {
 res.setHeader('Cache-Control','no-store');
 const fail=(status:number,code:string,message:string)=>res.status(status).json({code,message,requestId:req.requestId,timestamp:new Date().toISOString()});
 // This first connection is deliberately local-only until material entitlements are defined.
 if(process.env.NODE_ENV==='production') { fail(503,'MATERIALS_NOT_CONFIGURED','本番の教材閲覧権限は未設定です。'); return; }
 if(!req.auth?.trainingIds.length) { fail(403,'FORBIDDEN','研修への所属が必要です。'); return; }
 const selected=Object.prototype.hasOwnProperty.call(files,String(req.params.id))?files[String(req.params.id)]:undefined;
 if(!selected) { fail(404,'NOT_FOUND','この章のS3教材は未登録です。'); return; }
 const bucket=process.env.MATERIALS_BUCKET_NAME;
 if(!bucket) { fail(503,'MATERIALS_NOT_CONFIGURED','MATERIALS_BUCKET_NAMEを設定してください。'); return; }
 const s3=new S3Client({region:process.env.MATERIALS_REGION||'us-east-1'});
 try {
  const documents=await Promise.all(selected.map(async filename=>({filename,url:await getSignedUrl(s3,new GetObjectCommand({Bucket:bucket,Key:'materials/info2/'+filename,ResponseContentType:'application/pdf',ResponseContentDisposition:'inline'}),{expiresIn:300})})));
  res.json({documents,expiresAt:new Date(Date.now()+300000).toISOString()});
 } catch { fail(503,'MATERIALS_UNAVAILABLE','S3閲覧URLを発行できません。ローカルのAWS認証設定を確認してください。'); }
 finally {s3.destroy();}
});
