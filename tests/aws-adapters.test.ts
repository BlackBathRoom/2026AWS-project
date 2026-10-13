import { describe, expect, it } from 'vitest';
import { cognitoConfigFromEnv } from '../src/integrations/auth-provider';
import { DynamoEntityRepository } from '../src/repositories/dynamo-repository';
import { handler } from '../src/lambda';

describe('AWS adapter contracts', () => {
  it('Cognito設定からissuerを組み立てる', () => {
    const config = cognitoConfigFromEnv({ COGNITO_REGION: 'ap-northeast-1', COGNITO_USER_POOL_ID: 'pool-001', COGNITO_AUDIENCE: 'client-001' });
    expect(config.issuer).toBe('https://cognito-idp.ap-northeast-1.amazonaws.com/pool-001');
    expect(config.audience).toBe('client-001');
  });

  it('Cognito設定不足を拒否する', () => {
    expect(() => cognitoConfigFromEnv({ COGNITO_REGION: 'ap-northeast-1' })).toThrow('incomplete');
  });

  it('DynamoDB RepositoryとLambda handlerを公開する', () => {
    expect(new DynamoEntityRepository()).toBeInstanceOf(DynamoEntityRepository);
    expect(typeof handler).toBe('function');
  });
});