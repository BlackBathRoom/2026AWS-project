import express from 'express';
import { randomUUID } from 'node:crypto';
import { mockRouter } from './routes/mock-routes';
import { backendRouter } from './routes/backend-routes';

export const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { req.requestId = req.header('x-request-id') || `req-${randomUUID()}`; res.setHeader('x-request-id', req.requestId); next(); });
app.use('/api/v1', mockRouter);
app.use('/api/v1', backendRouter);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'リソースが見つかりません', requestId: res.getHeader('x-request-id'), timestamp: new Date().toISOString() }));
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
	const isMalformedJson = err instanceof SyntaxError && 'body' in err;
	res.status(isMalformedJson ? 400 : 500).json({ code: isMalformedJson ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message: isMalformedJson ? 'JSON形式が不正です' : '内部エラーが発生しました', requestId: req.requestId, timestamp: new Date().toISOString() });
});