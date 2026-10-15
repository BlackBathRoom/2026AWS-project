import { NextFunction, Request, Response } from 'express';
import { AuthContext } from '../contracts/user';
import { mockUsers } from '../mocks/sample-data';
import { CognitoJwtAuthenticationProvider, cognitoConfigFromEnv } from '../integrations/auth-provider';
import { DynamoEntityRepository } from '../repositories/dynamo-repository';

let cognitoProvider: CognitoJwtAuthenticationProvider | undefined;
let identityRepository: DynamoEntityRepository | undefined;

declare global { namespace Express { interface Request { auth?: AuthContext; requestId?: string; } } }
export function requireMockAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const auth = process.env.NODE_ENV !== 'production' && token ? mockUsers[token] : undefined;
  if (!auth || Date.parse(auth.expiresAt) <= Date.now()) { res.status(401).json({ code: 'UNAUTHORIZED', message: '認証が必要です', requestId: req.requestId, timestamp: new Date().toISOString() }); return; }
  req.auth = auth;
  next();
}

export async function requireBackendAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (process.env.NODE_ENV !== 'production') { requireMockAuth(req, res, next); return; }
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token || !process.env.COGNITO_REGION || !process.env.COGNITO_USER_POOL_ID || !process.env.COGNITO_AUDIENCE || !process.env.BACKEND_TABLE_NAME) { res.status(401).json({ code: 'UNAUTHORIZED', message: '認証が必要です', requestId: req.requestId, timestamp: new Date().toISOString() }); return; }
  try {
    cognitoProvider ||= new CognitoJwtAuthenticationProvider(cognitoConfigFromEnv());
    identityRepository ||= new DynamoEntityRepository();
    const tokenContext = await cognitoProvider.verifyBearerToken(token);
    const currentContext = await identityRepository.getCurrentAuthContext(process.env.BACKEND_TABLE_NAME, tokenContext.userId, tokenContext.organizationId);
    if (!currentContext) { res.status(401).json({ code: 'UNAUTHORIZED', message: '有効な所属がありません', requestId: req.requestId, timestamp: new Date().toISOString() }); return; }
    req.auth = currentContext;
    next();
  } catch { res.status(401).json({ code: 'UNAUTHORIZED', message: '認証が必要です', requestId: req.requestId, timestamp: new Date().toISOString() }); }
}