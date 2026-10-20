# 担当C向けB/C連携

## 責務境界

担当Bは認証・所属認可・学習モード・援助ポリシー・利用枠・採点・学習履歴・人間評価・到達判定を管理します。担当Cは教材、承認済み問題、知識マップ、RAG、AI回答生成を管理します。

BはAIプロンプト、Bedrock呼び出し、RAG検索を実装しません。

## ApprovedQuestion入力契約

```text
questionId
version
organizationId
trainingId
conceptId
format
prompt
choices
correctAnswer（B内部専用）
approvalStatus=APPROVED
ruleVersionId
```

受講者向けレスポンスには `correctAnswer` や非公開解説を含めません。未承認問題は出題・採点対象にしません。

## StudyContext

```text
userId
organizationId
trainingId
assignmentId
mode
assistancePolicy
ruleVersionId
```

`mode`、`assistancePolicy`、`userId`、所属はリクエスト値を信頼せず、Bがサーバー側データから生成します。Cはこのコンテキストに従い、評価モードで正答や直接解答を返してはいけません。

## AI利用可否

BはAIジョブ受付前に以下を確認します。

- 認証と組織所属
- 研修・課題へのアクセス
- 学習/評価モード
- 援助ポリシー
- 組織のAI停止設定
- 日次利用枠と同時実行枠

Cの実装先は `src/integrations/ai-provider.ts` の `AiTutorProvider` に接続します。AWS上ではSQS、Lambda、Bedrock、Knowledge Bases等へ差し替えます。

## 採点・評価との分界

- B: ApprovedQuestionに基づく客観採点、履歴保存、知識スコア
- C: AIのヒント、説明、例、教材根拠付き回答
- B: 人間レビュー、5軸到達、再評価、異議申立て
- C: AIは最終評価を確定しない

## 知識マップ

承認済みConceptとKnowledgeEdgeだけをBの復習推薦入力に使用します。未承認の関連、欠損した前提、問題不足の場合、Bは勝手に推論せず教員確認が必要な状態を返します。
