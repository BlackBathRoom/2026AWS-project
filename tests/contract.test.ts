import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import OpenAPISchemaValidator from 'openapi-schema-validator';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import YAML from 'yaml';
import { app } from '../src/app';
import { apiErrorSchema } from '../src/contracts/common';

const openapi = YAML.parse(fs.readFileSync(path.join(process.cwd(), 'openapi/openapi.yaml'), 'utf8'));
const api = request(app);
const auth = { Authorization: 'Bearer mock-user-001' };

function expectApiError(response: request.Response, status: number, code: string): void {
  expect(response.status).toBe(status);
  expect(apiErrorSchema.parse(response.body).code).toBe(code);
}

describe('B-01 API contract', () => {
  it('正常なAPIレスポンスを取得できる', async () => {
    const response = await api.get('/api/v1/me').set(auth);
    expect(response.status).toBe(200);
    expect(response.body.userId).toBe('user-001');
  });
  it('認証情報がない場合は401を返す', async () => expectApiError(await api.get('/api/v1/me'), 401, 'UNAUTHORIZED'));
  it('不正な認証情報の場合は401を返す', async () => expectApiError(await api.get('/api/v1/me').set('Authorization', 'Bearer invalid'), 401, 'UNAUTHORIZED'));
  it('他校のデータにアクセスできない', async () => expectApiError(await api.get('/api/v1/trainings?trainingId=training-002').set(auth), 404, 'NOT_FOUND'));
  it('必須パラメータが不足した場合は400を返す', async () => expectApiError(await api.get('/api/v1/study-context').set(auth), 400, 'VALIDATION_ERROR'));
  it('存在しないリソースには404を返す', async () => expectApiError(await api.get('/api/v1/study-context?trainingId=training-001&assignmentId=missing').set(auth), 404, 'NOT_FOUND'));
  it('エラー形式が共通仕様に一致する', async () => {
    const response = await api.get('/api/v1/study-context').set(auth);
    expectApiError(response, 400, 'VALIDATION_ERROR');
    expect(response.body).not.toHaveProperty('stack');
  });
  it('StudyContextのmodeをクライアントから変更できない', async () => {
    const response = await api.get('/api/v1/study-context?trainingId=training-001&assignmentId=assignment-001&mode=assessment').set(auth);
    expect(response.status).toBe(200);
    expect(response.body.mode).toBe('learning');
  });
  it('OpenAPIの記述が構文として正しい', () => {
    const result = new OpenAPISchemaValidator({ version: 3 }).validate(openapi);
    expect(result.errors).toEqual([]);
  });
  it('正常レスポンスがOpenAPIのスキーマと一致する', async () => {
    const response = await api.get('/api/v1/study-context?trainingId=training-001&assignmentId=assignment-001').set(auth);
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    ajv.addSchema({ $id: 'openapi-contract', components: { schemas: openapi.components.schemas } });
    const validate = ajv.compile({ $ref: 'openapi-contract#/components/schemas/StudyContext' });
    expect(validate(response.body)).toBe(true);
  });
});