# B担当への引継ぎ

入口：src/services/B/live.js。HTTPルートはsrc/contracts/endpoints.js。フロントはpublic/js/B-client.jsとadmin-views.js。

- Cognito access tokenの検証、MFA・重要操作の再認証、アプリDBでの所属・役割・担当・有効状態を実装。
- 全体管理PLATFORMは全学校のアカウント管理ができるが、提出内容閲覧・採点とは分離する。
- 管理者作成と権限変更は別管理者が承認。自己停止・自己削除・自己権限変更、最後の管理者消失を拒否。
- 利用停止・権限変更時の失効をAPIでも確認。Cognitoトークンを消すだけで既発行トークンの即時無効化を保証しない。
- DynamoDBへアカウント、申請、監査、担当割当、利用枠、削除受付を永続化。expected_versionとIdempotency-Keyを原子的に検証する。
- 招待作成の未送信状態を実送信の成功と混同しない。メール送信は本番接続後の運用で実装。
- 削除実行・バックアップ残存期限・保持方針は未実装。受付時点で完了と表示しない。
- AI文脈のlesson_idを本人の研修・対象単元・session_idに対応付け、サーバーで学習モードを確定。自力評価中は教材側の相談も拒否。
- 本番はAPI Gateway Regional REST API/Cognito authorizer、Lambda、DynamoDB等の既存仕様に接続。Expressはローカル確認用。

全体運営と学校ごとの評価者の活動範囲は別です。現モックの評価割当は同組織かつ同研修に限定します。全国横断の評価担当を必要とする場合は別途共通認可を設計してください。


## 10月15日追記
章別の問題・出題形式をAIが生成する最終方針をQUIZ_AI_PLAN.mdに追加しました。今回は方針と接続課題の整理のみで、既存APIの形式や処理は変更していません。
