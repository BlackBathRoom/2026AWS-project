import express from 'express';
import { randomUUID } from 'node:crypto';
import { mockRouter } from './routes/mock-routes';

export const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { req.requestId = req.header('x-request-id') || `req-${randomUUID()}`; res.setHeader('x-request-id', req.requestId); next(); });
app.use('/api/v1', mockRouter);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'リソースが見つかりません', requestId: res.getHeader('x-request-id'), timestamp: new Date().toISOString() }));
app.use((_err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ code: 'INTERNAL_ERROR', message: '内部エラーが発生しました', requestId: req.requestId, timestamp: new Date().toISOString() }));