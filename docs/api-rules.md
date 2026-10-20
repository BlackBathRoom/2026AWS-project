# API共通ルール

- APIプレフィックスは `/api/v1`、JSON、IDは文字列、時刻はUTCのISO 8601です。
- 本番はHTTPS、認証はBearer JWTです。現在のモックトークンはローカル専用です。
- 認証済みコンテキストの `organizationId`、`role`、`trainingIds` をサーバー側で解決し、クライアント値を信頼しません。
- エラーは `code`、`message`、`requestId`、`timestamp` の共通形式です。内部情報は返しません。