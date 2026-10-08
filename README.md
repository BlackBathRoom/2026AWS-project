# AI学習システム - 開発環境ブートストラップ

最小限の Node/Express アプリと Dockerfile、AWS CDK スキャフォールドを作成しました。

クイックスタート:

```bash
cd /home/itsuki/2026AWS-project
npm install
npm run dev
```

Docker ビルド:

```bash
docker build -t ai-learning-system .
docker run -p 3000:3000 ai-learning-system
```
# 2026AWS-project