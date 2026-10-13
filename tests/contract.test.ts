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

function validateOpenApiComponent(name: string, body: unknown): void {
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  ajv.addSchema({ $id: 'openapi-contract', components: { schemas: openapi.components.schemas } });
  const validate = ajv.compile({ $ref: `openapi-contract#/components/schemas/${name}` });
  expect(validate(body)).toBe(true);
}

describe('B-01 API contract', () => {
  it('health APIが正常応答する', async () => {
    const response = await api.get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
  it('正常なAPIレスポンスを取得できる', async () => {
    const response = await api.get('/api/v1/me').set(auth);
    expect(response.status).toBe(200);
    expect(response.body.userId).toBe('user-001');
  });
  it('認証ユーザーの研修一覧を取得できる', async () => {
    const response = await api.get('/api/v1/trainings').set(auth);
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([{ trainingId: 'training-001', organizationId: 'school-001', name: '情報II 基礎', status: 'active' }]);
  });
  it('一覧のページサイズを最大50件に制限する', async () => {
    const response = await api.get('/api/v1/trainings?limit=51').set(auth);
    expectApiError(response, 400, 'VALIDATION_ERROR');
  });
  it('認証情報がない場合は401を返す', async () => expectApiError(await api.get('/api/v1/me'), 401, 'UNAUTHORIZED'));
  it('不正な認証情報の場合は401を返す', async () => expectApiError(await api.get('/api/v1/me').set('Authorization', 'Bearer invalid'), 401, 'UNAUTHORIZED'));
  it('他校のデータにアクセスできない', async () => expectApiError(await api.get('/api/v1/trainings?trainingId=training-002').set(auth), 404, 'NOT_FOUND'));
  it('必須パラメータが不足した場合は400を返す', async () => expectApiError(await api.get('/api/v1/study-context').set(auth), 400, 'VALIDATION_ERROR'));
  it('不正なID形式の場合は400を返す', async () => expectApiError(await api.get('/api/v1/study-context?trainingId=bad%20id&assignmentId=assignment-001').set(auth), 400, 'VALIDATION_ERROR'));
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
  it('クライアントのorganizationIdとroleを信頼しない', async () => {
    const response = await api.get('/api/v1/me?organizationId=school-002&role=admin').set(auth);
    expect(response.body.organizationId).toBe('school-001');
    expect(response.body.role).toBe('student');
  });
  it('本番環境ではモック認証を受け付けない', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expectApiError(await api.get('/api/v1/me').set(auth), 401, 'UNAUTHORIZED');
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  });
  it('OpenAPIの記述が構文として正しい', () => {
    const result = new OpenAPISchemaValidator({ version: 3 }).validate(openapi);
    expect(result.errors).toEqual([]);
  });
  it('正常レスポンスがOpenAPIのスキーマと一致する', async () => {
    const health = await api.get('/api/v1/health');
    const me = await api.get('/api/v1/me').set(auth);
    const trainingList = await api.get('/api/v1/trainings').set(auth);
    const studyContext = await api.get('/api/v1/study-context?trainingId=training-001&assignmentId=assignment-001').set(auth);
    validateOpenApiComponent('HealthResponse', health.body);
    validateOpenApiComponent('UserProfile', me.body);
    validateOpenApiComponent('TrainingListResponse', trainingList.body);
    validateOpenApiComponent('StudyContext', studyContext.body);
  });
});