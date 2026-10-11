'use strict';
const express = require('express');
const path = require('node:path');
const { createDemoRouter } = require('./demo/router');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    next();
  });
  app.use(express.json({ limit: '3mb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  const demoEnabled = process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE !== '0';
  app.get('/api/config', (_req, res) => res.json({ demo: demoEnabled }));
  // B/CのAPI接続時はこのルーターを置き換える。デモAPIを本番に公開しない。
  if (demoEnabled) app.use('/api', createDemoRouter());
  app.use('/api', (_req, res) => res.status(503).json({ code: 'NOT_CONFIGURED', message: '本番APIは未接続です。担当B/CのAPIと認証を接続してください。' }));
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ code: 'REQUEST_ERROR', message: err.status === 413 ? '送信サイズが大きすぎます。' : 'リクエストを処理できませんでした。' }));
  return app;
}
if (require.main === module) {
  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '127.0.0.1';
  createApp().listen(port, host, () => console.log(`Listening on http://${host}:${port}`));
}
module.exports = { createApp };