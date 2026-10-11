# B/C担当への接続メモ

この版の `/api/*` は画面を先行開発するための仮のデモAPIです。
添付仕様書の正式APIは `/v1/*` で、名前・構造も異なります。**URLだけの変更では接続できません。**
本番接続時はB/CとOpenAPI・型・サンプル・エラーコードを合わせ、`public/js/api.js` に変換処理を用意してください。

## 対応関係

| デモの操作 | 仕様書の正式API | 主担当 | 接続時の注意 |
|---|---|---|---|
| `POST /api/demo/login` | Cognitoの認証フロー | B | 役割選択入口を削除し、認証済みユーザーの役割を取得する |
| `GET /api/me` | API-01 `GET /v1/me` | B | Bearer access token、所属、研修、権限、有効期限を検証 |
| `GET /api/materials` | API-02 `GET /v1/lessons/{id}` | C | 一覧取得方法も合意。公開版と原本の短期URL・出典・ページを受け取る |
| `GET /api/questions` | API-03 `GET /v1/quiz/next` | B | 問題を1つずつ取得。attempt_id、版、出題理由を保持する |
| `POST /api/answers` | API-04 `POST /v1/attempts` | B | Idempotency-Key、回答時間、採点方針、再回答と初回の区別 |
| `GET /api/progress` | API-05 `GET /v1/progress` | B | score/confidence/reasonsと5軸・証拠・評価状態を別々に描画 |
| `POST /api/ai/jobs` | API-06 `POST /v1/tutor/jobs` | C | session_id、課題/attempt_id、requested_action、冪等キーを追加 |
| `GET /api/ai/jobs/{id}` | API-07 `GET /v1/tutor/jobs/{id}` | C | job_idとネストしたresultを画面用に変換。公開・権限を毎回再確認 |
| `GET /api/training` | API-08 `GET /v1/cohorts/{id}/analytics` | B | 担当研修・単元で絞り込み。他校/担当外はAPI側で拒否 |
| `POST /api/admin/materials/{id}/transition` | API-09 `POST /v1/content/{id}/transitions` | C | expected_version/action/reason。実際の取込完了を待って公開 |
| `POST /api/ai/feedback` | API-10 `POST /v1/feedback` | C | interaction_id/type/commentに変換、個人情報を除去 |
| `POST /api/admin/delete-learning` | API-11 `POST /v1/admin/deletion-requests` | B | 即時全削除ではなく、対象・範囲・保持期限・バックアップ残存・再認証を扱う |
| 教材のテキスト登録・一覧 | API-14/15 `POST /v1/content/uploads` / `GET /v1/content` | C | 隔離アップロード、PDF解析、状態・カーソルを扱う |
| 問題・知識マップ（未実装） | API-16/17 | C | 下書き・承認・循環検査を伴う管理画面を追加 |
| `PUT /api/admin/settings` | API-18 `POST /v1/admin/policies` | B | policy版、再認証、緩和時の承認、停止の即時反映 |
| 研修目標（課題にまとめている） | API-19 `GET/PUT /v1/me/training-profile` | B | 経験・目標・時間をプロフィールとして分離 |
| `GET /api/task` | API-20 `GET /v1/training-assignments/{id}` | B | 監修課題・ルーブリック・援助方針を取得 |
| `PUT /api/draft` / `POST /api/submissions` | API-21 下書き作成・更新・submit | B | 課題版・提出版・expected_version・冪等キーを合わせる |
| `POST /api/attachments` | API-22 ファイル登録・complete・取得 | B | S3隔離・実体検査・検査待ち・検査失敗・サイズ制限を実装 |
| `POST /api/reviews` | API-23 GET/POST reviews・finalize | B | デモの一括保存を下書きと確定に分離。割当・自己レビュー禁止・証拠を検証 |
| `POST /api/appeals` | API-24 申立て・resolve | B | 別評価者の再割当、再評価、到達再計算を追加 |

API-12 StudyContext、API-13 ApprovedQuestionはB/C間の内部APIです。ブラウザから呼び出さず、正解や援助ポリシーの決定権をフロントへ渡しません。

## 現在のデモレスポンス

```json
{"jobId":"uuid"}
```

```json
{
  "status":"COMPLETED",
  "verdict":"SUPPORTED",
  "text":"画面に表示する検査済み回答（本番時）",
  "citations":[{"materialId":"m1","title":"教材名","chapter":"章","page":"1–2","version":1,"source":"出典"}]
}
```

このデモの回答は固定文で、実際のAI検査は行っていません。本番は検査前の中間生成文をフロントに渡しません。
フロントは2秒おきに状態を取得し、30秒で待機を打ち切ります（仕様書の提案値）。離脱時は待機を中止します。

エラー形式：

```json
{"code":"CONFLICT","message":"別画面で更新されています。内容を控えて再読み込みしてください。"}
```

401は再認証、403は権限/評価援助制限、409は版競合、429は利用上限、503はAI停止/本番未接続を表示します。
409時に入力を自動破棄しないこと、送信成功を確認できないときに保存済みと表示しないことを維持してください。

## 接続の順番

1. BからAPI URL、Cognito設定、所属・役割付き検証ユーザー、正式OpenAPIを受領する。
2. Cから公開教材、正常/拒否/失敗/時間切れのAI応答例を受領する。
3. `src/index.js` のデモルーターとデモ入口を本番の認証/APIへ置き換える。
4. `api.js` と画面の呼び出しを正式なリクエスト/レスポンスへ対応させる。秘密鍵・AWSアクセスキーをpublicに置かない。
5. 多校・担当外・期限切れ・自己レビュー・添付未検査の負例をB/Cと検証する。
6. 監修教材と正式な評価基準に置き換え、一連の操作を確認してから配信する。

CORS、トークン管理、CognitoのリダイレクトURL、配信先、APIの認可方式はBと合意して設定してください。
