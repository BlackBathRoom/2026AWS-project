# 情報Ⅱ 教員ラーニング：担当Aの画面デモ

画像に写っていた Express / CommonJS / `src/index.js` の構成に合わせた追加コードです。
既存リポジトリそのものは受領していないため、画像で確認できた起動部分を基に作成しています。
Reactやビルドツールは追加せず、HTML・CSS・JavaScriptで構成しました。

## 1. 最初に配置するファイル

ZIP内の `frontend-starter` は配布用フォルダ名です。そのフォルダ自体をプロジェクト内に置くのではなく、**中身を既存の `2026AWS-project` の対応する場所に配置**してください。

| 配布ファイル | 既存プロジェクトでの配置先 | 操作 |
|---|---|---|
| `src/index.js` | `2026AWS-project/src/index.js` | 画像と同じ内容なら置換。変更済みなら差分を取り込む |
| `src/demo/data.js` | `2026AWS-project/src/demo/data.js` | `demo` フォルダを作って追加 |
| `src/demo/router.js` | `2026AWS-project/src/demo/router.js` | 追加 |
| `public/index.html` | `2026AWS-project/public/index.html` | `public` フォルダを作って追加 |
| `public/css/style.css` | `2026AWS-project/public/css/style.css` | `css` フォルダを作って追加 |
| `public/js/api.js` | `2026AWS-project/public/js/api.js` | `js` フォルダを作って追加 |
| `public/js/app.js` | `2026AWS-project/public/js/app.js` | 追加 |
| `tests/demo.test.cjs` | `2026AWS-project/tests/demo.test.cjs` | テストを追加 |
| `README_FRONTEND.md` | `2026AWS-project/README_FRONTEND.md` | 本書を追加 |
| `API_CONTRACT.md` | `2026AWS-project/API_CONTRACT.md` | B/Cとの接続メモを追加 |
| `SPEC_COVERAGE.md` | `2026AWS-project/SPEC_COVERAGE.md` | 実装範囲表を追加 |
| `CHECK_RESULTS.md` | `2026AWS-project/CHECK_RESULTS.md` | 検証記録を追加 |

**既存の `package.json` / `package-lock.json` / `Dockerfile` / `cdk` は置き換えません。**
`package.example.json` は単独で起動する場合の参考であり、既存プロジェクトへの配置は不要です。

## 2. 起動（いまのMacのプロジェクトで）

既に `feature/frontend` ブランチならそのまま作業できます。VS Codeでプロジェクトを開き、ターミナルの現在位置が `2026AWS-project` であることを確認します。

```bash
git status
npm install
npm run dev
```

画像・直前の起動状況のように `dev` が `node src/index.js` を実行する設定なら、そのまま動きます。
もし `dev` が未定義なら、既存 `package.json` の `scripts` に `"dev": "node src/index.js"` を追加します。他の設定を消さないでください。

ブラウザで **http://localhost:3000** を開きます。
`/health` は引き続き `{ "status": "ok" }` を返します。
`index.html` の直接ダブルクリックではAPIが動かないため、必ずサーバー経由で開いてください。

Expressがまだ入っていない場合に限り、プロジェクト直下で `npm install express` を実行します。
この実装はNode.js 20以上を想定し、作成時はNode.js 24とExpress 5で検証しています。

ポート3000が使用中なら、既存の開発サーバーを `Control + C` で停止して再起動するか、次のようにします。

```bash
PORT=3001 npm run dev
```

この場合は http://localhost:3001 を開きます。
HTML/CSS/ブラウザJSの編集はページ再読み込み、`src` 内のサーバーコード編集はサーバー再起動が必要です。

## 3. Dockerを使う場合

通常の画面開発は上記の `npm run dev` で進められます。
既存Dockerfileは未確認です。Dockerで実行するなら、`public` と `src/demo` がイメージに含まれていることを確認してください。
たとえば既存の `COPY src ./src` に加え `COPY public ./public` が必要です。既に `COPY . .` があれば通常は含まれます。

開発用コンテナでは `HOST=0.0.0.0` と `NODE_ENV=development` を指定し、ホスト側はlocalhostのみに公開します。

```bash
docker build -t ai-learning-system .
docker run --rm -p 127.0.0.1:3000:3000 -e HOST=0.0.0.0 -e NODE_ENV=development ai-learning-system
```

このデモをインターネットへ公開しないでください。デモ入口では役割を誰でも選べます。
`NODE_ENV=production` または `DEMO_MODE=0` ではデモAPIを無効にします。実認証・実APIが自動で有効になるわけではありません。

## 4. 操作確認の順番

1. **受講教員**でデモに入る。
2. 「教材を学ぶ」で情報Ⅱ教材と情報Ⅰの補強教材を読む。
3. 「小テスト」で回答し、「学習・到達状況」で知識スコアと復習候補を確認する。
4. 「AIに相談」で `相関と因果の違いを説明して` と送信する。数秒後に固定のデモ回答と教材へのリンクが出る。
5. 「指導課題・提出」で6項目を入力する。援助を受けていなければ援助申告に `なし` と書く。
6. 「下書き保存」→「課題を提出」→確認ダイアログで確定する。
7. 左メニュー下の「役割を切り替える / 退出」から退出する。**サーバーを再起動しない**。
8. **評価者**で入り、「提出物レビュー」で提出版を開いて内容を確認する。
9. 5観点の点数、評価根拠、改善点を入力して「改善・再提出を依頼」または「評価を確定」を保存する。
10. **受講教員**に戻って履歴を確認する。下書きを改善・保存して再提出するとv2が増え、v1は残る。
11. **教材管理者**では教材登録・レビュー・承認・取込・公開・取り下げの状態を確認できる。
12. **運用管理者**ではAI停止・日次上限・自力評価モード・デモデータ削除を確認できる。

到達状況は最新の提出版の人間レビューを参照します。再提出したら新しいレビューが終わるまで未判定です。
同一小テストは初回結果を保存し、再送しても初回の結果を返します。正式な復習再回答の履歴管理は未実装です。

## 5. データ・認証・AIについて

- 画面は操作できますが、認証・AI・AWS・教材承認の実処理は未接続です。
- 架空の学校・受講者1名・評価者1名・単元1つ・問題3問です。教材は画面確認用の自作文章で、文部科学省の原文転載や専門家監修済み教材ではありません。
- AIは入力のキーワードに応じた固定デモ回答です。Bedrock、検索、Guardrailsは呼び出していません。
- データはサーバーのメモリ内です。ブラウザを更新してもサーバー稼働中は残り、サーバーを止めると消えます。
- デモセッションはHttpOnly Cookieに保存し、1時間で切れます。本番のCognito認証や所属・研修別の認可は別途必要です。
- 添付は画面確認用のUTF-8テキストのみです。PDF・画像・S3アップロード・隔離検査は未実装です。
- `public` だけをS3に置いても機能は完成しません。本番APIと認証を接続したうえでB担当が配信します。

## 6. どこを編集するか

| やりたいこと | 編集箇所 |
|---|---|
| 色、余白、文字サイズ、スマホ表示を変える | `public/css/style.css` |
| 画面の構成やボタン動作を変える | `public/js/app.js` の `views.home` / `views.task` など |
| 通信先、エラー処理、AI結果の待機処理を変える | `public/js/api.js` |
| デモ教材・小テストを変える | `src/demo/data.js` |
| デモ処理・保存・評価の動きを変える | `src/demo/router.js` |
| Expressの配信・API接続を変える | `src/index.js` |

画面部品へAPIデータを入れるときは `esc()` を通すか `textContent` を使います。教材・AI回答・添付をそのままHTMLとして実行しないでください。

## 7. テスト

既存プロジェクト直下で次を実行します。テストは一時ポートで独立したサーバーを起動し、開発用3000番のデータには触れません。

```bash
node --test tests/demo.test.cjs
```

提出版、競合、二重送信、役割制御、AI取得時の再確認、本番時のデモ無効化を検証します。
詳細な実施結果は `CHECK_RESULTS.md`、本番に向けた不足は `SPEC_COVERAGE.md` に記載しています。
