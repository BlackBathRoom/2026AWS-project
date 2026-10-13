# 担当A向けバックエンド連携

## 共通

- ローカルベースURL: `http://localhost:3000/api/v1`
- JSON、UTC ISO 8601、`Authorization: Bearer <token>`
- 回答・提出作成には `Idempotency-Key` を付ける
- エラーは `code`、`message`、`requestId`、`timestamp`
- モックトークンは `mock-user-001`（受講教員）、`mock-user-003`（研修担当）、`mock-user-004`（評価者）、`mock-user-005`（管理者）

## 学習

```text
GET  /quiz/next?lessonId=training-001
POST /attempts
GET  /progress?concept_id=concept-001
GET  /attainment?trainingId=training-001
```

回答送信例:

```json
{
  "attemptId": "attempt-001",
  "questionId": "question-001",
  "answer": ["b"],
  "responseTimeMs": 800
}
```

正答そのものは問題取得APIに含まれません。評価モード、課題援助ポリシー、所属はサーバー側で決定されます。

## 指導課題・提出

```text
GET   /training-assignments/{id}
POST  /submissions
GET   /submissions/{id}
PATCH /submissions/{id}
POST  /submissions/{id}/submit
POST  /submissions/{id}/files
POST  /files/{id}/complete
GET   /files/{id}
```

提出版は確定後に変更できません。再提出は既存版の上書きではなく、新しい版として扱います。添付は初期実装で2MB以下、TXT/CSV/PY/IPYNBのみを許可し、コードは実行しません。

## 評価・分析

```text
GET  /reviews
POST /reviews
POST /reviews/{id}/finalize
POST /review-appeals
POST /review-appeals/{id}/resolve
GET  /cohorts/{id}/analytics
```

自己レビュー、担当外研修、他校データへのアクセスは拒否されます。最終評価は人間評価者のみ確定できます。

## 起動

```bash
npm install
npm run dev
npm test
```

OpenAPIの正式契約は `openapi/openapi.yaml` を参照してください。
