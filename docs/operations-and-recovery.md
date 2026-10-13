# 担当B運用・復旧資料（ローカル設計）

## AWS費用見積入力

本資料は料金を固定せず、AWS採用時に入力する前提を管理します。

- 対象リージョン: 未確定（東京候補）
- 月間アクティブ利用者数: 入力値
- 1人あたりAI利用回数/日: 初期提案20回
- 平均入力文字数: 入力値
- 平均出力トークン数: 初期提案800トークン
- API Gatewayリクエスト数: 入力値
- Lambda実行回数・実行時間: 実測値
- DynamoDB読書き量・保存量: 実測値
- S3保存量・転送量: 実測値
- Bedrock、Knowledge Bases、検索保存先、Guardrails: 採用サービス確定後に入力
- CloudWatch、WAF、KMS、SQS、バックアップ: 固定費・従量費を分離

AI費用は概算として次の入力式を使用します。

```text
AI費用 = 回数 × (平均入力トークン × 入力単価 + 平均出力トークン × 出力単価)
       + 検索費 + 検査費 + 保存費 + API/実行費 + ログ/転送費
```

## 運用目標（提案値）

正式合意前の提案値です。`PolicyVersion` と導入先合意で確定します。

- 通常API p95: 2秒以下
- AI受付: 1秒以下
- AI受付から完了p95: 15秒以下
- AIジョブ期限: 30秒
- 同時通常API: 20利用
- 通常API: 10件/秒
- AI同時実行: 5件
- RTO: 4時間
- RPO: 24時間
- 月間可用性目標: 99.5%
- AI利用枠: 1人20回/日、同時ジョブ1件

## 復旧手順

1. APIと書き込み処理を停止または対象範囲だけ読み取り専用にする。
2. 復元先を別の検証用データ領域にする。
3. DB・提出物・教材の版を復元する。
4. `DeletionRecord` を復元データへ再適用する。
5. 組織・公開状態・提出状態・評価版を検査する。
6. 監査イベントを記録する。
7. 検証後に公開先を切り替える。

ローカルでは以下で削除台帳の再適用を確認できます。

```text
POST /api/v1/admin/deletion-requests
POST /api/v1/admin/deletion-requests/{id}/apply
POST /api/v1/admin/deletion-requests/{id}/reapply
```

## AWS接続時の置換

- DynamoDB PITR: `BackendRepository`
- S3 Versioning: `StorageProvider`
- Cognito: `AuthenticationProvider`
- CloudWatch/SNS: 構造化監査ログと通知アダプター
- API Gateway/Lambda: `src/app.ts` のHTTP実行アダプター

AWS実リソース、バックアップ、通知、予算設定は本リポジトリでは作成しません。
