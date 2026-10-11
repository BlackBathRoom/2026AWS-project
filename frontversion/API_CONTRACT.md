# API接続契約案 v2

**正式な経路・API番号・主要項目は仕様書05に準拠。詳細JSONの形状はこの実装の接続案であり、未合意です。** Bが版管理しA/B/Cで固定するまで本番契約にしないでください。

ルート一覧は `src/contracts/endpoints.js` が正本、型は `src/contracts/types.d.ts`。ExpressルートはB/Cメソッドへ委譲します。画面は `/api` や架空の本番APIを呼びません。`/dev/session` と `/dev/uploads/*` はmock時だけ存在する開発補助で、本番APIではありません。

## 共通

- base `/v1`、JSON/UTF-8、HTTPS。本番はBearer access token。mockのみHttpOnly Cookie。
- ISO8601 UTCを返し、画面と日次カウンターはJST。
- エラーは `{ "error": { "code": "VERSION_CONFLICT", "message": "…", "request_id": "…" } }`。
- 401未認証、403許可なし、404存在/可視性なし、409版/冪等競合、422入力、429上限、503停止/未接続。
- role/org/modeを入力から信頼しない。ctx.userはB.authenticateのサーバー解決値。
- API-04/06/21/23/24の変更操作は画面が `Idempotency-Key` を発行。同内容の通信再送は同キー。
- 版競合は入力を残して409表示。自動上書きしない。
- 一覧は最大50件。管理一覧はnext_cursorで続きを取得。実装時にレビュー一覧も全ページ対応を確認。

## 05にない詳細：今回の接続案

以下は「仕様書に記載済み」として扱わないでください。役割・状態enum名、補助フィールドも本番合意が必要です。

| 箇所 | 接続案 | 必要な理由 |
|---|---|---|
| API-01 | `policy` を追加 | 現在のAI停止・上限設定を表示。05には設定取得APIがない |
| API-05 | `{knowledge:[], competencies:[]}`、knowledgeにunit_id/sample_count | 概念のID命名規則に依存せず、章と知識/能力を対応させる |
| API-19 | training_planの各行にunit_id/lesson_id/assignment_id/session_id | 教材・課題・AIセッションの対応をBの返却値から選ぶ |
| API-20 | required_outputsをkey/label/description配列、rubric/scale、`my_submissions` | C監修の項目を画面へ反映し、保存した下書き・提出版を再取得。05にGET /submissionsがない |
| API-23 GET | `{items:[{submission,assignment,reviews,appeals}], next_cursor}` | 割当提出物と評価履歴をレビュー画面に表示。05は一覧の詳細形状を未定義 |
| 提出 | `version`は編集競合用、`submission_version`は不変提出版番号 | 更新回数と提出v1/v2の区別 |
| API-18 | reasonを追加 | A-10の変更理由入力・監査に対応（05の主要入力には未列記） |
| API-22 | `filename`、アップロードURLをpresigned_urlで返す、CLEAN/検査状態 | ファイル名表示と隔離アップロード・静的閲覧をつなぐ |
| 公的教材一覧 | `public/data/catalog.json`に公開メタデータだけを置く | 05には受講者用教材一覧APIがなく、管理専用API-15を流用しない |
| 管理状態/操作 | SUBMIT / APPROVE / START_INGESTION / PUBLISH / WITHDRAW | actionの具体enumが05には未列記 |
| role | teacher / reviewer / manager / approver / admin | Cognito group名自体は未確定。B側で表示ロールへ正規化 |

正式課題の分類・ルーブリック・概念粒度はCの監修待ちです。仮ID・固定課題を正式仕様として確定していません。原本PDFの上限、許諾情報の保存先、完了通知はCと確認が必要で、独自の本番経路は追加していません。

## 主なリクエスト

```json
POST /v1/attempts
{"attempt_id":"attempt-…","answer":"a","response_time_ms":4200}

POST /v1/tutor/jobs
{"session_id":"…","assignment_id":"…","question":"…","requested_action":"GUIDANCE","draft_version":2}

POST /v1/submissions
{"assignment_id":"…","assignment_version":1}

PATCH /v1/submissions/{id}
{"expected_version":1,"text":{"practice":"…","explanation":"…","diagnosis":"…","lesson":"…"},"aid_declaration":"…"}

POST /v1/submissions/{id}/submit
{"expected_version":2}

POST /v1/reviews
{"submission_id":"…","submission_version":1,"rubric_version":"…","axes":{"K":2,"P":2,"E":2,"D":2,"L":2},"rationale":"…","evidence_refs":["submission-…"],"required_outputs_confirmed":true}

POST /v1/reviews/{id}/finalize
{"expected_version":1}

POST /v1/review-appeals
{"assessment_id":"…","reason":"…"}

POST /v1/review-appeals/{id}/resolve
{"axes":{"K":2,"P":2,"E":2,"D":2,"L":2},"rationale":"…","evidence_refs":["submission-…"],"required_outputs_confirmed":true}
```

上のAPI-21のtextキーは例です。AはAPI-20のrequired_outputsを使って入力欄を生成します。Cが監修内容をBへ渡し、Bが任意の単元に対応したフィールドを返してください。

## AI

受付202は `{job_id,status,poll_after_ms}`。GETのstatusがSUCCEEDEDになったときだけresultを表示。ジョブ状態と回答結果を混同しません。

```json
{
  "job_id":"job-…",
  "status":"SUCCEEDED",
  "result":{
    "status":"INSUFFICIENT",
    "response_type":"GUIDANCE",
    "message":"根拠となる承認済み教材を確認できません。",
    "citations":[],
    "next_action":"OPEN_MATERIAL",
    "reason_code":"NO_APPROVED_SOURCE"
  }
}
```

SUPPORTEDなら1件以上の出典が必要です。各出典はsource_id/version/page/chunk_id。フロントは型欠落を拒否してHTMLをエスケープします。出典が実在し現行公開版かどうかはCのサーバーが検証します。フロントの形式検証だけで出典の真正性を保証できません。

## ファイル

1. POST `/submissions/{id}/files`：filename/type/size/checksum（SHA-256）を渡す。
2. 返却presigned_urlへPUT。画面は `application/octet-stream` を付けるのでS3側署名条件と合わせる。
3. POST `/files/{id}/complete`：検査状態を受け取る。CLEANになるまで表示・提出不可。
4. GET `/files/{id}`：本人/割当評価者認可後に静的内容。IPYNBの出力・HTMLやコードを実行しない。

モックのファイル検査は形式・容量・SHA-256・UTF-8・ノートブック構造だけです。マルウェア検査、S3隔離、非同期検査完了後のポーリングや期限切れ再発行はBの接続作業です。

## B/Cの内部呼出

現在の同一Expressプロセスでは `getC().getApprovedQuestion(ctx)` と `getB().getStudyContext(ctx)`。HTTP公開しません。Lambda等へ分割する場合はIAMのサービス間認可、タイムアウト、同じ文脈のorg/user/版照合へ置き換えてください。
