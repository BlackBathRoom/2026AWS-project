import { describe, expect, it } from 'vitest';
import { CognitoJwtAuthenticationProvider, cognitoConfigFromEnv } from '../src/integrations/auth-provider';
import { DynamoEntityRepository } from '../src/repositories/dynamo-repository';
import { handler } from '../src/lambda';
import { S3StorageProvider } from '../src/integrations/storage-provider';

describe('AWS adapter contracts', () => {
  it('Cognito設定からissuerを組み立てる', () => {
    const config = cognitoConfigFromEnv({ COGNITO_REGION: 'ap-northeast-1', COGNITO_USER_POOL_ID: 'pool-001', COGNITO_AUDIENCE: 'client-001' });
    expect(config.issuer).toBe('https://cognito-idp.ap-northeast-1.amazonaws.com/pool-001');
    expect(config.audience).toBe('client-001');
  });

  it('Cognito設定不足を拒否する', () => {
    expect(() => cognitoConfigFromEnv({ COGNITO_REGION: 'ap-northeast-1' })).toThrow('incomplete');
  });

  it('JWKS署名、issuer、access token claimsを検証する', async () => {
    const { SignJWT, exportJWK, generateKeyPair } = await import('jose');
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    Object.assign(jwk, { kid: 'test-key', alg: 'RS256', use: 'sig' });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'content-type': 'application/json' } });
    try {
      const config = cognitoConfigFromEnv({ COGNITO_REGION: 'ap-northeast-1', COGNITO_USER_POOL_ID: 'pool-001', COGNITO_AUDIENCE: 'client-001' });
      const token = await new SignJWT({ token_use: 'access', client_id: 'client-001', 'custom:organizationId': 'school-001', 'custom:role': 'student', 'custom:trainingIds': '["training-001"]' }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(config.issuer).setSubject('user-001').setIssuedAt().setExpirationTime('5m').sign(privateKey);
      const auth = await new CognitoJwtAuthenticationProvider(config).verifyBearerToken(token);
      expect(auth.userId).toBe('user-001');
      expect(auth.organizationId).toBe('school-001');
      expect(auth.trainingIds).toEqual(['training-001']);
    } finally { globalThis.fetch = originalFetch; }
  });

  it('client_idが一致しないCognito access tokenを拒否する', async () => {
    const { SignJWT, exportJWK, generateKeyPair } = await import('jose');
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    Object.assign(jwk, { kid: 'test-key', alg: 'RS256', use: 'sig' });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'content-type': 'application/json' } });
    try {
      const config = cognitoConfigFromEnv({ COGNITO_REGION: 'ap-northeast-1', COGNITO_USER_POOL_ID: 'pool-001', COGNITO_AUDIENCE: 'client-001' });
      const token = await new SignJWT({ token_use: 'access', client_id: 'wrong-client', 'custom:organizationId': 'school-001', 'custom:role': 'student', 'custom:trainingIds': '["training-001"]' }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(config.issuer).setSubject('user-001').setIssuedAt().setExpirationTime('5m').sign(privateKey);
      await expect(new CognitoJwtAuthenticationProvider(config).verifyBearerToken(token)).rejects.toThrow('claims are invalid');
    } finally { globalThis.fetch = originalFetch; }
  });

  it('DynamoDB RepositoryとLambda handlerを公開する', () => {
    expect(new DynamoEntityRepository()).toBeInstanceOf(DynamoEntityRepository);
    expect(typeof handler).toBe('function');
  });

  it('マルウェア検査が未実装のファイルをclean扱いしない', async () => {
    const storage = new S3StorageProvider('private-bucket', {} as never);
    await expect(storage.completeUpload('file-001', 'checksum')).resolves.toEqual({ scanStatus: 'pending' });
  });
});