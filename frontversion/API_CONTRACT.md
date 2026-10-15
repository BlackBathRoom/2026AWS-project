# 共通API形式（追加分を含む接続確認版）

既存の共通形式を基に /v1 を使用。src/contracts/endpoints.jsが経路一覧、types.d.tsが主要型、mock/B.js・C.js・admin.jsが動作例です。今回の管理APIはEXT採番で原仕様05のAPI番号と区別します。Excel自体は変更していません。

## 共通

JSONリクエスト/レスポンス。エラーは `{error:{code,message,request_id}}`。
管理更新はIdempotency-Key必須。同じキーで違う内容は409、版競合も409。理由reasonは必須です。一覧はitemsとnext_cursor、cursorは不透明値として返された値を使用。
権限変更を別管理者が承認する流れは今回の追加運用設計です。Excelの権限変更要件に一律の二者承認が必須と書かれているという意味ではありません。

## 教材内AI

POST /v1/tutor/jobs：
```json
{"session_id":"session-teacher-ii-1","lesson_id":"教材ID","question":"説明してください","requested_action":"EXPLANATION"}
```
lesson_id / assignment_id / attempt_id はいずれか1つ。教材相談にdraft_versionは指定不可。202でjob_idを返し、GET /v1/tutor/jobs/{id}で状態取得。質問時・回答取得時とも学習モードと方針を再確認します。

## 管理機能

GET /admin/overview：scope、accounts、pending_approvals、pending_deletions、policy、ai_usage。
GET /admin/directory：organizations、cohorts、roles。
GET /admin/accounts：items、next_cursor。q/role/statusで絞込。
POST /admin/accounts：display_name、email、role、organization_id、cohort_ids、reason。201でaccount、approval|null、invitation_sent、message。
PATCH /admin/accounts/{id}：action=SUSPEND/REACTIVATE/ROLE/COHORTS、expected_version、reason。ROLEはrole、COHORTSはcohort_idsを追加。accountと承認が必要な場合approvalを返す。
GET /admin/requests：申請一覧。
POST /admin/requests/{id}/decision：decision=APPROVE/REJECT、reason。申請者の自己承認を拒否。
POST /admin/policies：expected_version、ai_enabled、allow_answer、limits.daily_jobs、reason。制限強化はACTIVE、緩和はPENDING_APPROVAL。
GET/POST /admin/deletion-requests：一覧/受付。POSTはsubject_id、scope=ACCOUNT/LEARNING_DATA、reason。202、status=PENDING、backup_expiry=null。ACCOUNTは即時利用停止、実削除ではない。
GET /admin/audit：操作履歴items、next_cursor。
GET /admin/reviewer-assignments：items、appeals、next_cursor。
PUT /admin/reviewer-assignments/{learner_id} と /admin/review-appeals/{appeal_id}/assignment：reviewer_id、expected_version、reason。

すべての上記経路に /v1 を付けます。本番側の処理はB/Cが実装します。履歴や監査の保存期間、実削除完了状態など未接続部分の形式は本番統合時に合わせて更新してください。


## 10月15日追記
章別の問題・出題形式をAIが生成する最終方針をQUIZ_AI_PLAN.mdに追加しました。今回は方針と接続課題の整理のみで、既存APIの形式や処理は変更していません。
