import { NextFunction, Request, Response } from 'express';
import { AuthContext } from '../contracts/user';
import { mockUsers } from '../mocks/sample-data';

declare global { namespace Express { interface Request { auth?: AuthContext; requestId?: string; } } }
export function requireMockAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const auth = process.env.NODE_ENV !== 'production' && token ? mockUsers[token] : undefined;
  if (!auth) { res.status(401).json({ code: 'UNAUTHORIZED', message: '認証が必要です', requestId: req.requestId, timestamp: new Date().toISOString() }); return; }
  req.auth = auth;
  next();
}