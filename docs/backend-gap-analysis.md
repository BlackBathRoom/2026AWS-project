# 担当B仕様比較と未実装一覧

比較対象はワークスペースの仕様書 v1.1、特に02、05、06、07、08、09、10シートです。AWS実リソースと担当C所有機能は実装対象外としています。

## API・機能比較

| ID/分野 | 現在の状態 | 実装済み | 未実装・制約 |
|---|---|---|---|
| B-01 / API-01 | ローカル完了 | 共通ID、エラー、OpenAPI、ページング、冪等キー、28パス | API Gatewayの実運用、正式API番号の最終合意 |
| API-03 | ローカル完了 | 承認済み問題の安全な取得、正答非公開、所属確認、再回答root | 複数問題・複数形式 |
| API-04 | 部分完了 | 客観採点、問題版保存、練習再回答除外、Idempotency-Key、409、DynamoDB条件更新アダプター | 複数問題版、実DynamoDB接続 |
| API-05 / B-05 | 部分完了 | 直近10件、重み2/1、3件未満null、信頼度、K/P/E/D/L分離、到達保存 | 正式な全ルーブリック・複数単元の判定 |
| API-06/07 | 部分完了 | AI受付、評価モード・利用枠・停止確認、SQS provider、本人限定状態取得 | SQS worker、ジョブ状態の永続化、Cからの実完了通知、30秒期限・DLQ |
| API-08 / B-08 | 部分完了 | 担当研修の進捗・到達・提出済み・未提出・レビュー待ち集計 | 全集計項目、cursor/CSV、実DB集計 |
| API-11 / B-09 | 部分完了 | 管理者削除要求、適用、削除台帳再適用 | 再認証、24時間削除、AWSバックアップ連携 |
| API-12/13 | 契約完了 | InternalStudyContext、ApprovedQuestion、承認版型 | B/C間のサービス認証・実データ受渡し |
| API-18 / B-09 | ローカル完了 | AI停止、利用上限、ポリシー版、監査 | 承認ワークフロー、AWS Budgets連携 |
| API-19 | ローカル完了 | 研修プロフィール、expectedVersion、プロフィール履歴 | 実DB条件付き更新 |
| API-20 | ローカル完了 | 公開課題、所属確認、援助ポリシー | Cからの監修済み課題受渡し、複数課題版 |
| API-21 | 部分完了 | 下書き、更新、提出固定、再提出版、競合、Idempotency-Key | 必須成果物・添付検査状態の厳密な提出判定 |
| API-22 | 部分完了 | 2MB、MIME、HTML拒否、検査状態、提出版紐付け、S3署名URLアダプター | 提出APIへのS3配線、隔離/実体検査、検査worker |
| API-23 | 部分完了 | 評価者割当、観点点数、根拠、確定、自己レビュー拒否、競合 | 評価者負荷・期限、AWS永続化 |
| API-24 | 部分完了 | 異議申立て、別評価者の再評価、旧評価superseded、ReEvaluation履歴 | 再評価後の全到達再計算、AWS永続化 |
| B-06 | 部分完了 | 承認済み問題がある場合の推薦、知識マップ未登録時の教員確認 | Approved KnowledgeEdgeによる前提経路・間隔計算 |
| B-07 | 部分完了 | StudyContext、learning/assessment、援助ポリシー | 課題stage、全ポリシー状態、C実AI連携 |
| B-11 | ローカル資料完了 | 費用入力項目、RTO/RPO、復旧手順 | 実測値、AWS費用、復旧演習 |
| B-12 | ローカル部分完了 | 36件の自動テスト、OpenAPI検証、同時版競合テスト | 30分負荷、AWS統合、復旧試験 |
| B-13〜15 | ローカル部分完了 | 課題、提出、添付、レビュー、削除台帳 | 実S3、バックアップ復元、削除再適用のAWS検証 |

## 担当C所有のため未実装

以下は仕様上CまたはC主担当のため、B側では契約・認可境界だけを実装しています。

- 教材API、教材承認・公開、Knowledge Base取込
- 問題作成・監修、KnowledgeEdgeの編集・承認
- Bedrock、RAG、Guardrails、AIプロンプト
- AI回答本文、引用生成、AI品質350問評価

## AWS依存で未実装

- AWS上でのCognito User Pool、API Gateway、Lambda、DynamoDB、S3、CloudWatchの実リソース作成・デプロイ
- SQS/DLQ/SchedulerのCDK構成
- 全業務RepositoryのDynamoDB永続化配線、Transaction、PITR運用確認
- S3署名URLを提出APIへ注入し、実体/ウイルス検査workerと統合
- CloudWatch Logs/SNS/CloudTrail/WAF/KMS/Budgetsの実設定
- 実AWS環境での認証、権限、負荷、障害、復旧試験

## 検証済み範囲

```text
TypeScript build: 成功
Vitest: 43 tests passed / 0 failed
CDK TypeScript build/synth: 成功
OpenAPI: 3.0.3、28 paths、0 validation errors
静的診断: エラーなし
```

この文書の「完了」はローカルで確認できた範囲を示し、AWS本番動作を保証しません。
