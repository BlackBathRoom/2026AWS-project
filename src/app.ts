import express from 'express';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { mockRouter } from './routes/mock-routes';
import { materialRouter } from './routes/material-routes';
import { backendRouter } from './routes/backend-routes';

export const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { req.requestId = req.header('x-request-id') || `req-${randomUUID()}`; res.setHeader('x-request-id', req.requestId); next(); });

// フロントエンドが読み込むランタイム設定 (public/index.html の /runtime-config.js)。
// ローカル確認用の既定値。本番では B 担当がデプロイ環境ごとに api_base(API GatewayのURL)と
// mode を差し替える。静的UIとバックエンドAPIを同一オリジンで確認できるようにする。
app.get('/runtime-config.js', (_req, res) => {
  const config = {
    mode: process.env.FRONTEND_MODE || 'mock',
    tutor_enabled: Boolean(process.env.TUTOR_QUEUE_URL && process.env.BACKEND_TABLE_NAME),
    api_base: process.env.FRONTEND_API_BASE || '/api/v1',
    upload_origins: (process.env.FRONTEND_UPLOAD_ORIGINS || '').split(',').filter(Boolean),
  };
  res.type('application/javascript').send(`window.RUNTIME_CONFIG=${JSON.stringify(config)};`);
});

// 静的フロントエンド(public/)の配信。ローカルで npm run dev すると UI を確認できる。
// 認証必須の backendRouter より前に置き、静的アセットが認証でブロックされないようにする。
// 本番の静的配信は S3/CloudFront 等を想定 (担当A/B運用) で、ここはローカル確認用。
// パスは開発(tsx: src/から)・ビルド後(dist/src/から)の双方でリポジトリ直下の public を指す。
app.use(express.static(path.resolve(__dirname, '..', 'public')));
app.use(express.static(path.resolve(__dirname, '..', '..', 'public')));

app.use('/api/v1', materialRouter);
app.use('/api/v1', mockRouter);
app.use('/api/v1', backendRouter);
app.use(mockRouter);
app.use(backendRouter);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'リソースが見つかりません', requestId: res.getHeader('x-request-id'), timestamp: new Date().toISOString() }));
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
	const isMalformedJson = err instanceof SyntaxError && 'body' in err;
	res.status(isMalformedJson ? 400 : 500).json({ code: isMalformedJson ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message: isMalformedJson ? 'JSON形式が不正です' : '内部エラーが発生しました', requestId: req.requestId, timestamp: new Date().toISOString() });
});