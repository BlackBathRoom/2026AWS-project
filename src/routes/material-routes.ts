import { Readable } from 'node:stream';
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

// Local PDF.js reader: same-origin authenticated download avoids changing S3 CORS.
// Keep the same fixed-key and local-only boundaries as the signed-URL route.
materialRouter.get('/materials/:id/pdf', async (req,res) => {
 res.setHeader('Cache-Control','no-store');
 const fail=(status:number,code:string,message:string)=>res.status(status).json({code,message,requestId:req.requestId,timestamp:new Date().toISOString()});
 if(process.env.NODE_ENV==='production'){fail(503,'MATERIALS_NOT_CONFIGURED','本番の教材閲覧権限は未設定です。');return;}
 if(!req.auth?.trainingIds.length){fail(403,'FORBIDDEN','研修への所属が必要です。');return;}
 const selected=Object.prototype.hasOwnProperty.call(files,String(req.params.id))?files[String(req.params.id)]:undefined;
 if(!selected){fail(404,'NOT_FOUND','この章のS3教材は未登録です。');return;}
 const raw=req.query.part??'0';
 if(typeof raw!=='string'||!/^\d+$/.test(raw)||!selected[Number(raw)]){fail(400,'VALIDATION_ERROR','分冊の指定が不正です。');return;}
 const bucket=process.env.MATERIALS_BUCKET_NAME;
 if(!bucket){fail(503,'MATERIALS_NOT_CONFIGURED','MATERIALS_BUCKET_NAMEを設定してください。');return;}
 const client=new S3Client({region:process.env.MATERIALS_REGION||'us-east-1'});
 const abort=new AbortController();const timeout=setTimeout(()=>abort.abort(),60000);
 const onClose=()=>{if(!res.writableEnded)abort.abort();};res.on('close',onClose);
 let stream: Readable | undefined;
 try{
  const object=await client.send(new GetObjectCommand({Bucket:bucket,Key:'materials/info2/'+selected[Number(raw)]}),{abortSignal:abort.signal});
  const max=32*1024*1024;
  if(!(object.Body instanceof Readable))throw new Error('Missing body');
  stream=object.Body;
  if((object.ContentLength||0)>max){fail(413,'MATERIAL_TOO_LARGE','この教材は画面内表示の容量上限を超えています。別タブで開いてください。');return;}
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of stream){const buffer=Buffer.from(chunk);size+=buffer.length;if(size>max){fail(413,'MATERIAL_TOO_LARGE','この教材は画面内表示の容量上限を超えています。別タブで開いてください。');return;}chunks.push(buffer);}
  res.setHeader('X-Content-Type-Options','nosniff');res.type('application/pdf').send(Buffer.concat(chunks));
 }catch{if(!res.destroyed&&!res.headersSent)fail(503,'MATERIALS_UNAVAILABLE','S3教材を取得できません。AWS認証・閲覧権限・教材ファイルを確認してください。');}
 finally{stream?.destroy();clearTimeout(timeout);res.off('close',onClose);client.destroy();}
});
