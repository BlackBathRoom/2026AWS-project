import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const aws = vi.hoisted(() => ({
  createClient: vi.fn(), destroy: vi.fn(), getSignedUrl: vi.fn(),
}));

// Real command objects, mocked client/signing: no credentials or network.
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return { ...sdk, S3Client: class {
    constructor(config: unknown) { aws.createClient(config); }
    destroy = aws.destroy;
  } };
});
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: aws.getSignedUrl }));

import { app } from '../src/app';
import { materialTraining } from '../src/integrations/material-access';
import { mockUsers } from '../src/mocks/sample-data';

const signedIn = (path: string) =>
  request(app).get(path).auth('mock-user-001', { type: 'bearer' });

describe('textbook reader signed URL contract', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MATERIALS_BUCKET_NAME', 'test-materials');
    vi.stubEnv('MATERIALS_REGION', 'us-east-1');
    aws.createClient.mockReset();
    aws.destroy.mockReset();
    aws.getSignedUrl.mockReset();
    aws.getSignedUrl.mockImplementation(async (_client: unknown, command: GetObjectCommand) =>
      'https://materials.example.test/' + command.input.Key + '?signed=test');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('requires authentication before creating a view URL', async () => {
    const response = await request(app).get('/api/v1/materials/ii-1/view');
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
    expect(aws.createClient).not.toHaveBeenCalled();
    expect(aws.getSignedUrl).not.toHaveBeenCalled();
  });

  it('keeps health public', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('rejects unregistered chapters and prototype keys before S3 access', async () => {
    for (const id of ['ii-99', '__proto__', 'constructor']) {
      const response = await signedIn('/api/v1/materials/' + id + '/view');
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NOT_FOUND');
    }
    expect(aws.createClient).not.toHaveBeenCalled();
    expect(aws.getSignedUrl).not.toHaveBeenCalled();
  });

  it('returns both mapped chapter 3 documents with short-lived URLs and no cache', async () => {
    const before = Date.now();
    const response = await signedIn('/api/v1/materials/ii-3/view');
    const after = Date.now();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.body.documents).toEqual([
      { filename: '03_chapter3_part1.pdf', url: 'https://materials.example.test/materials/info2/03_chapter3_part1.pdf?signed=test' },
      { filename: '03_chapter3_part2.pdf', url: 'https://materials.example.test/materials/info2/03_chapter3_part2.pdf?signed=test' },
    ]);
    expect(Date.parse(response.body.expiresAt)).toBeGreaterThanOrEqual(before + 300_000);
    expect(Date.parse(response.body.expiresAt)).toBeLessThanOrEqual(after + 300_000);
    expect(aws.createClient).toHaveBeenCalledExactlyOnceWith({ region: 'us-east-1' });
    expect(aws.getSignedUrl).toHaveBeenCalledTimes(2);
    const calls = aws.getSignedUrl.mock.calls;
    expect(calls[0][0]).toBe(calls[1][0]);
    expect(calls[0][0].destroy).toBe(aws.destroy);
    expect(calls.map(([, command]) => command.input)).toEqual([
      { Bucket: 'test-materials', Key: 'materials/info2/03_chapter3_part1.pdf', ResponseContentType: 'application/pdf', ResponseContentDisposition: 'inline' },
      { Bucket: 'test-materials', Key: 'materials/info2/03_chapter3_part2.pdf', ResponseContentType: 'application/pdf', ResponseContentDisposition: 'inline' },
    ]);
    for (const [, command, options] of calls) {
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(options).toEqual({ expiresIn: 300 });
    }
    expect(aws.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not let part, key, or bucket queries change the mapped document', async () => {
    const response = await signedIn('/api/v1/materials/ii-1/view?part=1&key=private/secret.pdf&bucket=another-bucket');
    expect(response.status).toBe(200);
    expect(response.body.documents).toHaveLength(1);
    expect(response.body.documents[0].filename).toBe('01_chapter1.pdf');
    expect(aws.getSignedUrl.mock.calls[0][1].input).toMatchObject({
      Bucket: 'test-materials', Key: 'materials/info2/01_chapter1.pdf',
    });
    expect(aws.getSignedUrl).toHaveBeenCalledTimes(1);
  });

  it('reports an unconfigured bucket without creating an S3 client', async () => {
    vi.stubEnv('MATERIALS_BUCKET_NAME', undefined);
    const response = await signedIn('/api/v1/materials/ii-1/view');
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('MATERIALS_NOT_CONFIGURED');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(aws.createClient).not.toHaveBeenCalled();
    expect(aws.getSignedUrl).not.toHaveBeenCalled();
  });

  it('hides presigning errors and releases the S3 client on failure', async () => {
    aws.getSignedUrl.mockRejectedValue(new Error('sensitive S3 credential details'));
    const response = await signedIn('/api/v1/materials/ii-1/view');
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('MATERIALS_UNAVAILABLE');
    expect(response.body.message).toBe('教材の閲覧URLを取得できませんでした。');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toContain('sensitive');
    expect(response.body).not.toHaveProperty('stack');
    expect(response.body).not.toHaveProperty('documents');
    expect(aws.destroy).toHaveBeenCalledTimes(1);
  });

  it('retires the old PDF proxy without downloading or signing a document', async () => {
    const response = await signedIn('/api/v1/materials/ii-3/pdf?part=1');
    expect(response.status).toBe(410);
    expect(response.body.code).toBe('DIRECT_DOWNLOAD_REQUIRED');
    expect(aws.createClient).not.toHaveBeenCalled();
    expect(aws.getSignedUrl).not.toHaveBeenCalled();
  });

  it('only grants production access to an entitled organization and training', () => {
    const env = { NODE_ENV: 'production', MATERIALS_ENTITLEMENTS_JSON: '{"school-001":["training-001"]}' };
    expect(materialTraining(mockUsers['mock-user-001'], env)).toBe('training-001');
    expect(materialTraining(mockUsers['mock-user-002'], env)).toBeUndefined();
    expect(materialTraining({ ...mockUsers['mock-user-001'], trainingIds: [] }, env)).toBeUndefined();
    expect(materialTraining(mockUsers['mock-user-001'], { NODE_ENV: 'production' })).toBeUndefined();
    expect(materialTraining(mockUsers['mock-user-001'], { ...env, MATERIALS_ENTITLEMENTS_JSON: 'invalid' })).toBeUndefined();
  });
});
