import { NextFunction, Request, Response } from 'express';
import { AuthContext } from '../contracts/user';
import { mockUsers } from '../mocks/sample-data';
import { CognitoJwtAuthenticationProvider, cognitoConfigFromEnv } from '../integrations/auth-provider';

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
  if (!token || !process.env.COGNITO_REGION || !process.env.COGNITO_USER_POOL_ID || !process.env.COGNITO_AUDIENCE) { res.status(401).json({ code: 'UNAUTHORIZED', message: '認証が必要です', requestId: req.requestId, timestamp: new Date().toISOString() }); return; }
  try { const provider = new CognitoJwtAuthenticationProvider(cognitoConfigFromEnv()); req.auth = await provider.verifyBearerToken(token); next(); } catch { res.status(401).json({ code: 'UNAUTHORIZED', message: '認証が必要です', requestId: req.requestId, timestamp: new Date().toISOString() }); }
}