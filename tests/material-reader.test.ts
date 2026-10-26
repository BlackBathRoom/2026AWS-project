import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { Readable } from 'node:stream';
const s3=vi.hoisted(()=>({send:vi.fn(),destroy:vi.fn()}));
vi.mock('@aws-sdk/client-s3',()=>({S3Client:class{send=s3.send;destroy=s3.destroy},GetObjectCommand:class{constructor(public input:unknown){}}}));
import { app } from '../src/app';
describe('local textbook reader',()=>{
 beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('MATERIALS_BUCKET_NAME','test-materials');s3.send.mockReset();s3.destroy.mockReset();});
 afterEach(()=>vi.unstubAllEnvs());
 it('requires authentication',async()=>{expect((await request(app).get('/api/v1/materials/ii-1/pdf')).status).toBe(401);expect(s3.send).not.toHaveBeenCalled();});
 it('keeps health public',async()=>{expect((await request(app).get('/api/v1/health')).status).toBe(200);});
 it('rejects unknown chapters and invalid parts before S3 access',async()=>{
  for(const path of ['ii-99/pdf','ii-1/pdf?part=-1','ii-1/pdf?part=3','ii-1/pdf?part=0&part=1'])expect((await request(app).get('/api/v1/materials/'+path).auth('mock-user-001',{type:'bearer'})).status).toBeGreaterThanOrEqual(400);
  expect(s3.send).not.toHaveBeenCalled();
 });
 it('serves only the mapped chapter and part, with no cache',async()=>{
  s3.send.mockResolvedValue({Body:Readable.from([Buffer.from('%PDF-1.7 test')]),ContentLength:13});
  const res=await request(app).get('/api/v1/materials/ii-3/pdf?part=1').auth('mock-user-001',{type:'bearer'});
  expect(res.status).toBe(200);expect(res.headers['content-type']).toContain('application/pdf');expect(res.headers['cache-control']).toBe('no-store');
  expect(s3.send.mock.calls[0][0].input).toEqual({Bucket:'test-materials',Key:'materials/info2/03_chapter3_part2.pdf'});expect(s3.destroy).toHaveBeenCalled();
 });
 it('limits PDF size',async()=>{s3.send.mockResolvedValue({Body:Readable.from(['large']),ContentLength:33*1024*1024});expect((await request(app).get('/api/v1/materials/ii-1/pdf').auth('mock-user-001',{type:'bearer'})).status).toBe(413);});
 it('returns a useful error without leaking S3 error details',async()=>{s3.send.mockRejectedValue(new Error('sensitive'));const res=await request(app).get('/api/v1/materials/ii-1/pdf').auth('mock-user-001',{type:'bearer'});expect(res.status).toBe(503);expect(JSON.stringify(res.body)).not.toContain('sensitive');});
});
