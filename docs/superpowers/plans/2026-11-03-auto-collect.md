# 記録の自動収集 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 記録係が終了した記録を、先生のドライブのスプレッドシートへ自動で集め、教員画面で日付ごとに見られるようにする。

**Architecture:** アプリ全体を Apps Script のウェブアプリとして公開する。Google との通信は `js/remote.js` に閉じ込め、`google.script.run` がない GitHub 版では今までどおり動かす。`tools/build-gas.mjs` が既存の ES モジュールを 1 つの HTML にまとめる。

**Tech Stack:** 既存の HTML/CSS/JS、Google Apps Script（V8）、clasp。

**Spec:** `docs/superpowers/specs/2026-11-03-auto-collect-design.md`

## Global Constraints

- アクセスは学校のドメインの全員、実行は先生。記録を読み出す関数は先生本人だけ。
- 記録の形式は `version: 1` のまま。`id` は省略可。
- シートに書く文字は先頭に `'` を付ける。
- 記録（JSON）が 45,000 文字を超えるものは受け取らない。
- GitHub 版の動作（ファイル提出、通信なしでの起動）を壊さない。

### Task 1: 記録番号と送信待ち（model / storage / remote）
- `createSession` に `id`、`toExport` に `id`、`parseExport` で `id` が文字以外なら壊れたものとする。`ensureId(s)`。
- `store.listOutbox / addOutbox / removeOutbox`。
- `js/remote.js`：`createRemote(runner)`、`flushOutbox(store, remote)`（同時に 1 つだけ実行、ok のものだけ消す、失敗理由を返す）。
- テスト：`tests/model.test.js`、`tests/storage.test.js`、`tests/remote.test.js`。

### Task 2: Google 側（gas/Code.gs, gas/appsscript.json）
- `doGet`、`submitRecord`、`isTeacher`、`listDates`、`getRecords`。
- テスト：`tests/gas.test.js`（Node の vm とにせものの Google）。

### Task 3: 画面
- `app.js`：通常の import、送り直しの仕組み、先生のときだけ教師ボタン、GitHub 版だけサービスワーカー。
- `result.js`：送信待ちに入れて送り、状態を表示。
- `teacher.js`：日付の選択と読み込み、更新。

### Task 4: Apps Script 用のまとめ（tools/build-gas.mjs）
- `gas/build/index.html`、`preview.html`、`Code.gs`、`appsscript.json`、`.claspignore`。
- 確認：まとめた JS の構文チェック、`preview.html` をブラウザで通す。

### Task 5: 公開
- clasp で先生のアカウントにスプレッドシート付きの Apps Script を作り、送り込み、デプロイ。
- README に手順（貼り付け方式も）を追加。公開版で記録係・教員を試す。
