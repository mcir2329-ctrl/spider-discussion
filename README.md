# スパイダー討論 記録アプリ

班の記録係が Chromebook で発言者をタップすると、発言のつながりが蜘蛛の巣のような図になります。
討論後に記録ファイルを提出し、教師はすべての班を並べて比べられます。
データはその Chromebook の中にだけ保存され、外部へは送られません。

## 使い方

### 記録係（生徒）
1. 「記録係として使う」を押す。
2. 班の名前・テーマ・人数・座席の並びを選び、席に名前（または出席番号）を入れる。席はドラッグで動かせる。
3. 「記録をはじめる」→「開始」。話した人の席をタップする。必要なら下の「質問」「根拠」などを押す。
4. 押し間違えたら「取り消し」。休むときは「一時停止」。
5. 終わったら「終了」。結果画面の「提出用に保存」で `.json` と `.png` が保存される。
   （Chrome が「複数のファイルのダウンロード」の許可を求めたら「許可」を押す）
6. ダウンロードフォルダの 2 つのファイルを Google Classroom に添付して提出する。

### 教師
1. 提出された `.json` をダウンロードする。
2. 「教師として使う」を押し、ファイルをまとめて選ぶ（ドラッグでも可）。
3. 班ごとの図と比較表が出る。カードを押すと詳しく見られる。「比較表を CSV で保存」でスプレッドシートに使える。

## 公開のしかた（GitHub Pages）
1. GitHub で新しいリポジトリを作り、このフォルダの中身をすべてアップロードする。
2. リポジトリの Settings → Pages で、Branch を `main`、フォルダを `/ (root)` にして Save。
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で開ける。この URL を Classroom で配る。
4. 配る前に、生徒の Chromebook でその URL が学校のフィルターに止められずに開けるか確かめる。
5. 一度開けば、通信がなくても動く。Chrome のアドレスバーの「インストール」からホーム画面に追加できる。

アプリを更新したときは、`sw.js` の `CACHE` の値（`spider-v1`）を `spider-v2` のように変えてからアップロードする。

## 記録を先生のドライブに自動で集める（Apps Script 版）

記録係が「終了」すると、記録が先生のスプレッドシートに自動で届きます。
先生は「教師として使う」で日付を選ぶと、その日の全班の記録を見られます。
学校の Google アカウントでログインしている人だけが開け、記録を読み出せるのは先生だけです。

### 最初に 1 回だけ行う準備（貼り付け方式）
1. `npm run build:gas` を実行する（`gas/build/` に `index.html` と `Code.gs` ができる）。
2. 学校のアカウントで Google スプレッドシートを新しく作る（名前の例：「スパイダー討論 記録」）。
3. メニューの「拡張機能」→「Apps Script」を開く。
4. 左の「コード.gs」の中身をすべて消し、`gas/build/Code.gs` の中身を貼り付ける。
5. 左の「ファイル」の「＋」→「HTML」で、名前を `index` にして作り、中身をすべて消して `gas/build/index.html` の中身を貼り付ける。
6. 左の歯車「プロジェクトの設定」で「『appsscript.json』マニフェスト ファイルをエディタで表示する」にチェックを入れ、
   エディタに出た `appsscript.json` の中身を `gas/build/appsscript.json` の中身に置き換える。
7. 保存（Ctrl+S）する。
8. 右上の「デプロイ」→「新しいデプロイ」→ 種類の歯車で「ウェブアプリ」を選ぶ。
   - 次のユーザーとして実行：自分
   - アクセスできるユーザー：（学校名）内の全員
9. 「デプロイ」を押し、アクセスの承認を求められたら自分の学校アカウントで許可する。
10. 表示された「ウェブアプリの URL」（`https://script.google.com/a/macros/…/exec`）を Classroom で生徒に配る。

### アプリを更新したとき
1. `npm run build:gas` を実行し、手順 4〜5 と同じように `Code.gs` と `index` の中身を貼り替えて保存する。
2. 「デプロイ」→「デプロイを管理」→ 鉛筆のアイコン →「バージョン」を「新バージョン」にして「デプロイ」。URL は変わらない。

### clasp で入れる場合（Apps Script API が使えるとき）
https://script.google.com/home/usersettings で「Google Apps Script API」をオンにしてから：
`npx @google/clasp login` → `npx @google/clasp create-script --type sheets --title "スパイダー討論 記録" --rootDir gas/build`
→ `npm run build:gas` → `npx @google/clasp push -f` → `npx @google/clasp create-deployment`

## 開発
- テスト：`npm test`（ブラウザでは `tests/index.html`）
- 確認用サーバー：`npm run serve` → `http://localhost:8080/`
- 図の見た目の確認：`http://localhost:8080/tests/web.html`
