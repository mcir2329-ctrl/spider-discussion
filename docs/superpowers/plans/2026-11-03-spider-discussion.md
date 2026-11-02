# スパイダー討論 記録アプリ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 班の記録係が Chromebook で発言者をタップして蜘蛛の巣図を記録し、討論後にファイルで提出し、教師が全班を比較できる Web アプリ（PWA）を作る。

**Architecture:** ビルド不要の ES モジュール構成。`js/model.js` に記録データの操作と集計をすべて集め（DOM に依存しない純粋な関数、Node でテスト）、画面ごとのファイルは model の関数を呼んで結果を描くだけにする。図は `js/web.js` が SVG で描き、記録・結果・教師の3画面で共有する。設計書のファイル構成に、DOM 作成の補助 `js/dom.js`、開発用サーバー `tools/serve.mjs`、`package.json`（テスト実行用）を加える。

**Tech Stack:** HTML / CSS / JavaScript（ES モジュール）、SVG、localStorage、Service Worker。テストは自作の小さなテスト関数を Node 24 とブラウザの両方で実行。外部ライブラリなし。

**Spec:** `docs/superpowers/specs/2026-11-03-spider-discussion-design.md`

## Global Constraints

- 動作環境：Chromebook の Chrome。画面はおよそ 1366×768。タッチ操作とマウス操作の両方に対応する。
- サーバーは使わない。データはその端末の中にだけ保存し、外部へ送信しない。
- 配布：GitHub Pages などの静的ホスティング。一度開いたあとは通信なしで動く（PWA）。
- HTML・CSS・JavaScript のみ。ビルドツールや外部ライブラリは使わない（開発用の Node スクリプトはアプリ本体に含めない）。
- 人数：2〜12 人。
- 発言の種類：初期値は「質問／根拠／反論／つなぐ／まとめ」。最大 8 個。
- 保存できる準備設定：最大 10 件。古いものから消える。
- 提出ファイル名：`班名_日付.json` と `班名_日付.png`。
- CSV は UTF-8 の BOM 付き。
- 記録ファイルの形式：`app: "spider-discussion"`、`version: 1`、項目は `app, version, group, topic, date, layout, members, types, turns, startedAt, totalSeconds`。
- 画面に出す文言はすべて日本語。

## ファイル構成

```
index.html            画面の骨組み
manifest.json         ホーム画面への追加の設定
icon.svg              アプリのアイコン
sw.js                 通信なしで動かすためのサービスワーカー
css/style.css         見た目
js/app.js             画面の切り替え、ホーム画面
js/dom.js             DOM 要素を作る補助関数 h()
js/model.js           記録データの操作、集計、書き出し・読み込み、CSV（DOM に依存しない）
js/web.js             蜘蛛の巣の図を SVG で描く、PNG にする
js/storage.js         端末への保存、ファイルの保存と読み込み
js/setup.js           準備画面
js/record.js          記録画面
js/result.js          結果画面
js/teacher.js         集約画面（教師）
tests/harness.js      小さなテスト関数
tests/model.test.js   model.js のテスト
tests/storage.test.js storage.js のテスト
tests/run.mjs         Node でテストを実行する
tests/index.html      ブラウザでテストを実行する
tests/web.html        図の見た目を確認するページ
tools/serve.mjs       開発用の静的サーバー（127.0.0.1:8080）
package.json          npm test / npm run serve
.claude/launch.json   ブラウザでの確認用
README.md             使い方と公開の手順
```

## 記録データの内部の形（全タスク共通）

`createSession()` が返すオブジェクト。書き出し用の項目に、記録中だけ使う項目を加えたもの。model の操作関数はこのオブジェクトを**直接書き換えて同じオブジェクトを返す**。

```js
{
  app: 'spider-discussion', version: 1,
  group: '3班', topic: '…', date: '2026-11-03', layout: 'circle' | 'rect' | 'free',
  members: [{ id: 'm1', name: '12', x: 0.5, y: 0.12 }],   // x, y は 0〜1 の割合
  types: [{ id: 't1', label: '質問', color: '#2f6fdd' }],
  turns: [{ member: 'm1', start: 0, duration: 10, type: 't1' | null }],
  // 最後の発言は記録中 duration: null（まだ終わっていない）
  startedAt: null | ISO文字列, totalSeconds: 0,
  // ここから記録中だけ使う項目（書き出さない）
  status: 'ready' | 'running' | 'paused' | 'ended',
  elapsedBefore: 0,      // 一時停止の前までにたまった秒数
  runningSince: null,    // 今の区間が始まった時刻（ミリ秒）。動いていなければ null
  savedAt: undefined,    // record.js が保存のたびに入れる時刻（ミリ秒）
}
```

時刻はすべて引数 `now`（ミリ秒）で受け取る。`start` は「討論の開始からの秒数（一時停止の時間を除く）」。発言時間は、次の人をタップした時点（または終了した時点）の経過秒数から `start` を引いたもの。一時停止中は時間が進まないので、一時停止の時間は自然に除かれる。

---

### Task 1: 土台とテストの仕組み

**Files:**
- Create: `package.json`, `tools/serve.mjs`, `.claude/launch.json`
- Create: `tests/harness.js`, `tests/run.mjs`, `tests/index.html`, `tests/model.test.js`
- Create: `js/model.js`

**Interfaces:**
- Produces:
  - `tests/harness.js`：`test(name: string, fn: () => void)`、`eq(actual, expected, msg?: string)`（JSON にして比べる）、`run(): {name, ok, error?}[]`
  - `js/model.js`：`formatSeconds(sec: number): string`（例 `65.4 → "1:05"`）、`todayString(d?: Date): string`（端末の日付で `YYYY-MM-DD`）
  - `npm test` で全テストを実行し、失敗があれば終了コード 1

- [ ] **Step 1: Git を始める**

```bash
git init
git add docs
git commit -m "docs: スパイダー討論アプリの設計書を追加"
```

- [ ] **Step 2: `package.json` を作る**

```json
{
  "name": "spider-discussion",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node tests/run.mjs",
    "serve": "node tools/serve.mjs"
  }
}
```

- [ ] **Step 3: 開発用サーバー `tools/serve.mjs` を作る**

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = normalize(process.cwd());
const port = Number(process.env.PORT) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = normalize(join(root, path.endsWith('/') ? path + 'index.html' : path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`http://localhost:${port}/`));
```

- [ ] **Step 4: `.claude/launch.json` を作る**

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "spider", "runtimeExecutable": "node", "runtimeArgs": ["tools/serve.mjs"], "port": 8080 }
  ]
}
```

- [ ] **Step 5: テスト関数 `tests/harness.js` を作る**

```js
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg} expected ${e} but got ${a}`);
}

export function run() {
  return tests.map(({ name, fn }) => {
    try {
      fn();
      return { name, ok: true };
    } catch (err) {
      return { name, ok: false, error: err.message };
    }
  });
}
```

- [ ] **Step 6: Node 用の実行ファイル `tests/run.mjs` を作る**

```js
import { run } from './harness.js';
import './model.test.js';

const results = run();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ' — ' + r.error}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 7: ブラウザ用の実行ページ `tests/index.html` を作る**

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>テスト結果</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 16px; }
  .ok { color: #1f7a3a; }
  .ng { color: #c0392b; font-weight: 600; }
</style>
</head>
<body>
<h1>テスト結果</h1>
<p id="summary"></p>
<ul id="list"></ul>
<script type="module">
  import { run } from './harness.js';
  import './model.test.js';

  const results = run();
  const failed = results.filter((r) => !r.ok).length;
  document.getElementById('summary').textContent = `${results.length - failed}/${results.length} passed`;
  for (const r of results) {
    const li = document.createElement('li');
    li.className = r.ok ? 'ok' : 'ng';
    li.textContent = `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ' — ' + r.error}`;
    document.getElementById('list').append(li);
  }
</script>
</body>
</html>
```

- [ ] **Step 8: 失敗するテストを書く（`tests/model.test.js`）**

```js
import { test, eq } from './harness.js';
import { formatSeconds, todayString } from '../js/model.js';

test('formatSeconds は 分:秒 にする', () => {
  eq(formatSeconds(0), '0:00');
  eq(formatSeconds(65.4), '1:05');
  eq(formatSeconds(600), '10:00');
});

test('todayString は端末の日付を YYYY-MM-DD にする', () => {
  eq(todayString(new Date(2026, 10, 3, 9, 5)), '2026-11-03');
});
```

- [ ] **Step 9: テストが失敗することを確かめる**

Run: `npm test`
Expected: `js/model.js` が見つからないエラー（`ERR_MODULE_NOT_FOUND`）で終了コード 1

- [ ] **Step 10: `js/model.js` を作る**

```js
export const APP_ID = 'spider-discussion';
export const FORMAT_VERSION = 1;

const pad2 = (n) => String(n).padStart(2, '0');

export function formatSeconds(sec) {
  const total = Math.floor(sec);
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}

export function todayString(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
```

- [ ] **Step 11: テストが通ることを確かめる**

Run: `npm test`
Expected: `2/2 passed`

- [ ] **Step 12: コミット**

```bash
git add package.json tools .claude tests js
git commit -m "chore: テストの仕組みと開発用サーバーを追加"
```

---

### Task 2: 座席の並びと記録の操作（model）

**Files:**
- Modify: `js/model.js`（末尾に追加）
- Modify: `tests/model.test.js`（末尾に追加）

**Interfaces:**
- Consumes: Task 1 の `APP_ID`, `FORMAT_VERSION`
- Produces（すべて `js/model.js` から export）:
  - 定数 `MIN_MEMBERS = 2`, `MAX_MEMBERS = 12`, `MAX_TYPES = 8`, `DEFAULT_TYPES: {id,label,color}[]`（5 個）
  - `layoutPositions(layout: 'circle'|'rect'|'free', count: number): {x, y}[]`
  - `createSession({group, topic, date, layout, members, types}): Session`
  - `elapsed(s, now): number`（0.1 秒単位）
  - `start(s, now)`, `pause(s, now)`, `resume(s, now)`, `addTurn(s, memberId, now)`, `setTurnType(s, typeId)`, `undo(s)`, `end(s, now)`, `reopen(s)` — いずれも `s` を書き換えて `s` を返す。状態が合わないときは何もしない
  - `turnDuration(s, turn, now): number`（終わっていない発言は今までの秒数）

- [ ] **Step 1: 失敗するテストを書く（`tests/model.test.js` の import を差し替え、末尾にテストを追加）**

ファイル先頭の import を次に置き換える。

```js
import { test, eq } from './harness.js';
import {
  formatSeconds, todayString, DEFAULT_TYPES, layoutPositions, createSession,
  elapsed, start, pause, resume, addTurn, setTurnType, undo, end, reopen,
} from '../js/model.js';
```

末尾に追加する。

```js
function mk(n = 3) {
  const members = Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}`, name: `A${i + 1}`, x: 0.5, y: 0.5 }));
  return createSession({ group: '1班', topic: 'T', date: '2026-11-03', layout: 'circle', members, types: DEFAULT_TYPES });
}

test('円形の並び（4人）は上から時計回り', () => {
  eq(layoutPositions('circle', 4), [{ x: 0.5, y: 0.12 }, { x: 0.86, y: 0.5 }, { x: 0.5, y: 0.88 }, { x: 0.14, y: 0.5 }]);
});

test('長方形の並びは上の列と下の列に分ける', () => {
  eq(layoutPositions('rect', 4), [{ x: 0.325, y: 0.2 }, { x: 0.675, y: 0.2 }, { x: 0.675, y: 0.8 }, { x: 0.325, y: 0.8 }]);
  eq(layoutPositions('rect', 3), [{ x: 0.325, y: 0.2 }, { x: 0.675, y: 0.2 }, { x: 0.5, y: 0.8 }]);
});

test('自由配置の初期値はます目に並べる', () => {
  eq(layoutPositions('free', 4), [{ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 }, { x: 0.3, y: 0.7 }, { x: 0.7, y: 0.7 }]);
});

test('12人でもすべての席が図の内側に入る', () => {
  for (const layout of ['circle', 'rect', 'free']) {
    for (const p of layoutPositions(layout, 12)) {
      eq(p.x >= 0.05 && p.x <= 0.95 && p.y >= 0.05 && p.y <= 0.95, true, `${layout} ${JSON.stringify(p)}`);
    }
  }
});

test('開始前のタップは記録しない', () => {
  const s = mk();
  addTurn(s, 'm1', 0);
  eq(s.turns.length, 0);
  eq(s.status, 'ready');
});

test('開始すると startedAt に開始時刻が入る', () => {
  const s = start(mk(), Date.UTC(2026, 10, 3, 1, 15));
  eq(s.status, 'running');
  eq(s.startedAt, '2026-11-03T01:15:00.000Z');
});

test('次の人をタップすると前の人の発言時間が決まる', () => {
  const s = start(mk(), 0);
  addTurn(s, 'm1', 0);
  addTurn(s, 'm2', 10000);
  eq(s.turns, [
    { member: 'm1', start: 0, duration: 10, type: null },
    { member: 'm2', start: 10, duration: null, type: null },
  ]);
});

test('経過時間は 0.1 秒単位', () => {
  const s = start(mk(), 0);
  eq(elapsed(s, 1234), 1.2);
});

test('一時停止していた時間は数えない', () => {
  const s = start(mk(), 0);
  addTurn(s, 'm1', 0);
  pause(s, 5000);
  resume(s, 65000);
  addTurn(s, 'm2', 70000);
  eq(s.turns[0].duration, 10);
  eq(s.turns[1].start, 10);
});

test('一時停止中のタップは記録しない', () => {
  const s = start(mk(), 0);
  pause(s, 1000);
  addTurn(s, 'm1', 2000);
  eq(s.turns.length, 0);
});

test('同じ人を続けてタップすると新しい発言として数える', () => {
  const s = start(mk(), 0);
  addTurn(s, 'm1', 0);
  addTurn(s, 'm1', 3000);
  eq(s.turns.length, 2);
});

test('種類は付け直せて、同じボタンをもう一度押すと外れる', () => {
  const s = start(mk(), 0);
  addTurn(s, 'm1', 0);
  setTurnType(s, 't1');
  eq(s.turns[0].type, 't1');
  setTurnType(s, 't1');
  eq(s.turns[0].type, null);
  setTurnType(s, 't2');
  eq(s.turns[0].type, 't2');
});

test('種類は最後の発言にだけ付く', () => {
  const s = start(mk(), 0);
  addTurn(s, 'm1', 0);
  addTurn(s, 'm2', 1000);
  setTurnType(s, 't3');
  eq(s.turns.map((t) => t.type), [null, 't3']);
});

test('取り消すと最後の発言が消え、その前の発言が続きになる', () => {
  const s = start(mk(), 0);
  addTurn(s, 'm1', 0);
  addTurn(s, 'm2', 10000);
  undo(s);
  eq(s.turns, [{ member: 'm1', start: 0, duration: null, type: null }]);
});

test('終了すると最後の発言時間と全体の時間が決まる', () => {
  const s = start(mk(), 0);
  addTurn(s, 'm1', 0);
  addTurn(s, 'm2', 10000);
  end(s, 25000);
  eq(s.status, 'ended');
  eq(s.totalSeconds, 25);
  eq(s.turns[1].duration, 15);
  addTurn(s, 'm3', 30000);
  eq(s.turns.length, 2);
});

test('一時停止中に終了すると一時停止の時点までを数える', () => {
  const s = start(mk(), 0);
  addTurn(s, 'm1', 0);
  pause(s, 5000);
  end(s, 100000);
  eq(s.totalSeconds, 5);
  eq(s.turns[0].duration, 5);
});

test('終了を取り消すと一時停止の状態で続きから記録できる', () => {
  const s = start(mk(), 0);
  addTurn(s, 'm1', 0);
  addTurn(s, 'm2', 10000);
  addTurn(s, 'm1', 20000);
  end(s, 50000);
  reopen(s);
  eq(s.status, 'paused');
  eq(s.turns[2].duration, null);
  resume(s, 100000);
  addTurn(s, 'm3', 103000);
  eq(s.turns[2].duration, 33);
  eq(s.turns[3].start, 53);
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm test`
Expected: `does not provide an export named 'DEFAULT_TYPES'` のエラーで終了コード 1

- [ ] **Step 3: `js/model.js` の末尾に実装を追加する**

```js
export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 12;
export const MAX_TYPES = 8;

export const DEFAULT_TYPES = [
  { id: 't1', label: '質問', color: '#2f6fdd' },
  { id: 't2', label: '根拠', color: '#1f9d55' },
  { id: 't3', label: '反論', color: '#d64545' },
  { id: 't4', label: 'つなぐ', color: '#d98a00' },
  { id: 't5', label: 'まとめ', color: '#8a4fd6' },
];

const round1 = (v) => Math.round(v * 10) / 10;
const round3 = (v) => Math.round(v * 1000) / 1000;

export function layoutPositions(layout, count) {
  if (layout === 'circle') {
    return Array.from({ length: count }, (_, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / count;
      return { x: round3(0.5 + 0.36 * Math.cos(a)), y: round3(0.5 + 0.38 * Math.sin(a)) };
    });
  }
  if (layout === 'rect') {
    const top = Math.ceil(count / 2);
    const row = (n, y) => Array.from({ length: n }, (_, i) => ({ x: round3(0.15 + (0.7 * (i + 0.5)) / n), y }));
    return [...row(top, 0.2), ...row(count - top, 0.8).reverse()];
  }
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => ({
    x: round3(0.1 + (0.8 * ((i % cols) + 0.5)) / cols),
    y: round3(0.1 + (0.8 * (Math.floor(i / cols) + 0.5)) / rows),
  }));
}

export function createSession({ group, topic, date, layout, members, types }) {
  return {
    app: APP_ID,
    version: FORMAT_VERSION,
    group,
    topic,
    date,
    layout,
    members: members.map((m) => ({ id: m.id, name: m.name, x: m.x, y: m.y })),
    types: types.map((t) => ({ id: t.id, label: t.label, color: t.color })),
    turns: [],
    startedAt: null,
    totalSeconds: 0,
    status: 'ready',
    elapsedBefore: 0,
    runningSince: null,
  };
}

export function elapsed(s, now) {
  const running = s.runningSince === null ? 0 : (now - s.runningSince) / 1000;
  return round1(s.elapsedBefore + running);
}

const lastTurn = (s) => s.turns[s.turns.length - 1];

export function turnDuration(s, turn, now) {
  return turn.duration ?? round1(elapsed(s, now) - turn.start);
}

export function start(s, now) {
  if (s.status !== 'ready') return s;
  s.status = 'running';
  s.runningSince = now;
  s.startedAt = new Date(now).toISOString();
  return s;
}

export function pause(s, now) {
  if (s.status !== 'running') return s;
  s.elapsedBefore = elapsed(s, now);
  s.runningSince = null;
  s.status = 'paused';
  return s;
}

export function resume(s, now) {
  if (s.status !== 'paused') return s;
  s.runningSince = now;
  s.status = 'running';
  return s;
}

export function addTurn(s, memberId, now) {
  if (s.status !== 'running') return s;
  const t = elapsed(s, now);
  const last = lastTurn(s);
  if (last) last.duration = round1(t - last.start);
  s.turns.push({ member: memberId, start: t, duration: null, type: null });
  return s;
}

export function setTurnType(s, typeId) {
  const last = lastTurn(s);
  if (!last || (s.status !== 'running' && s.status !== 'paused')) return s;
  last.type = last.type === typeId ? null : typeId;
  return s;
}

export function undo(s) {
  if (s.status !== 'running' && s.status !== 'paused') return s;
  s.turns.pop();
  const last = lastTurn(s);
  if (last) last.duration = null;
  return s;
}

export function end(s, now) {
  if (s.status !== 'running' && s.status !== 'paused') return s;
  s.elapsedBefore = elapsed(s, now);
  s.runningSince = null;
  s.totalSeconds = s.elapsedBefore;
  const last = lastTurn(s);
  if (last) last.duration = round1(s.totalSeconds - last.start);
  s.status = 'ended';
  return s;
}

export function reopen(s) {
  if (s.status !== 'ended') return s;
  const last = lastTurn(s);
  if (last) last.duration = null;
  s.status = 'paused';
  return s;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test`
Expected: `19/19 passed`

- [ ] **Step 5: コミット**

```bash
git add js/model.js tests/model.test.js
git commit -m "feat: 座席の並びと記録の操作を追加"
```

---

### Task 3: 線と集計（model）

**Files:**
- Modify: `js/model.js`（末尾に追加）
- Modify: `tests/model.test.js`（import に追加し、末尾にテストを追加）

**Interfaces:**
- Consumes: Task 2 の `createSession`, `start`, `addTurn`, `setTurnType`, `end`, `elapsed`, `turnDuration`
- Produces:
  - `edges(turns): {a, b, count}[]`（`a < b` の文字列順。同じ人どうしは除く。最初に現れた順）
  - `lastEdge(turns): {from, to, type} | null`
  - `memberStats(s, now): {id, name, count, seconds, byType: {[typeId]: number}}[]`（members の順）
  - `groupStats(s, now): {totalTurns, totalSeconds, silentCount, maxCount, minCount}`
  - `typeShares(s): {[label]: number}`（0〜1、小数第3位まで）

- [ ] **Step 1: 失敗するテストを書く**

import に `edges, lastEdge, memberStats, groupStats, typeShares` を加える。

```js
import {
  formatSeconds, todayString, DEFAULT_TYPES, layoutPositions, createSession,
  elapsed, start, pause, resume, addTurn, setTurnType, undo, end, reopen,
  edges, lastEdge, memberStats, groupStats, typeShares,
} from '../js/model.js';
```

末尾に追加する。

```js
function played() {
  const s = start(mk(), 0);
  addTurn(s, 'm1', 0);
  setTurnType(s, 't1');
  addTurn(s, 'm2', 10000);
  setTurnType(s, 't2');
  addTurn(s, 'm1', 20000);
  setTurnType(s, 't1');
  end(s, 50000);
  return s;
}

const turnsOf = (ids) => ids.map((member) => ({ member, start: 0, duration: 0, type: null }));

test('線は2人の組ごとにまとめ、向きは区別しない', () => {
  eq(edges(turnsOf(['m1', 'm2', 'm1', 'm3', 'm3', 'm2'])), [
    { a: 'm1', b: 'm2', count: 2 },
    { a: 'm1', b: 'm3', count: 1 },
    { a: 'm2', b: 'm3', count: 1 },
  ]);
});

test('最後の線は直前の発言者から今の発言者へ', () => {
  eq(lastEdge([]), null);
  eq(lastEdge(turnsOf(['m1'])), null);
  eq(lastEdge(turnsOf(['m1', 'm1'])), null);
  eq(lastEdge([{ member: 'm1', type: null }, { member: 'm2', type: 't3' }]), { from: 'm1', to: 'm2', type: 't3' });
});

test('一人ずつの回数・時間・種類', () => {
  eq(memberStats(played(), 0), [
    { id: 'm1', name: 'A1', count: 2, seconds: 40, byType: { t1: 2 } },
    { id: 'm2', name: 'A2', count: 1, seconds: 10, byType: { t2: 1 } },
    { id: 'm3', name: 'A3', count: 0, seconds: 0, byType: {} },
  ]);
});

test('記録中は終わっていない発言も今までの時間で数える', () => {
  const s = start(mk(), 0);
  addTurn(s, 'm1', 0);
  eq(memberStats(s, 7000)[0].seconds, 7);
});

test('班全体の集計', () => {
  eq(groupStats(played(), 0), { totalTurns: 3, totalSeconds: 50, silentCount: 1, maxCount: 2, minCount: 0 });
});

test('種類ごとの割合は種類の名前で返す', () => {
  eq(typeShares(played()), { 質問: 0.667, 根拠: 0.333, 反論: 0, つなぐ: 0, まとめ: 0 });
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm test`
Expected: `does not provide an export named 'edges'` のエラーで終了コード 1

- [ ] **Step 3: `js/model.js` の末尾に実装を追加する**

```js
export function edges(turns) {
  const map = new Map();
  for (let i = 1; i < turns.length; i++) {
    const from = turns[i - 1].member;
    const to = turns[i].member;
    if (from === to) continue;
    const [a, b] = from < to ? [from, to] : [to, from];
    const key = `${a}|${b}`;
    const e = map.get(key) || { a, b, count: 0 };
    e.count++;
    map.set(key, e);
  }
  return [...map.values()];
}

export function lastEdge(turns) {
  if (turns.length < 2) return null;
  const prev = turns[turns.length - 2];
  const cur = turns[turns.length - 1];
  if (prev.member === cur.member) return null;
  return { from: prev.member, to: cur.member, type: cur.type };
}

export function memberStats(s, now) {
  return s.members.map((m) => {
    const mine = s.turns.filter((t) => t.member === m.id);
    const byType = {};
    for (const t of mine) if (t.type) byType[t.type] = (byType[t.type] || 0) + 1;
    const seconds = round1(mine.reduce((sum, t) => sum + turnDuration(s, t, now), 0));
    return { id: m.id, name: m.name, count: mine.length, seconds, byType };
  });
}

export function groupStats(s, now) {
  const counts = memberStats(s, now).map((m) => m.count);
  return {
    totalTurns: s.turns.length,
    totalSeconds: s.status === 'ended' ? s.totalSeconds : elapsed(s, now),
    silentCount: counts.filter((c) => c === 0).length,
    maxCount: Math.max(...counts),
    minCount: Math.min(...counts),
  };
}

export function typeShares(s) {
  const out = {};
  for (const t of s.types) {
    const n = s.turns.filter((x) => x.type === t.id).length;
    out[t.label] = (out[t.label] || 0) + (s.turns.length ? round3(n / s.turns.length) : 0);
  }
  return out;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test`
Expected: `25/25 passed`

- [ ] **Step 5: コミット**

```bash
git add js/model.js tests/model.test.js
git commit -m "feat: 線と集計の計算を追加"
```

---

### Task 4: 書き出し・読み込み・CSV（model）

**Files:**
- Modify: `js/model.js`（末尾に追加）
- Modify: `tests/model.test.js`（import に追加し、末尾にテストを追加）

**Interfaces:**
- Consumes: Task 3 の `groupStats`, `typeShares`, `memberStats`
- Produces:
  - `toExport(s): object`（設計書 6 章の項目だけを、この順で持つ深いコピー）
  - `parseExport(text: string): {ok: true, session} | {ok: false, error: string}`（`session.status` は `'ended'`）
  - `fileBaseName(s): string`（`班名_日付`。ファイル名に使えない文字と空白は `_` に置き換える）
  - `compareRows(sessions): {headers: string[], rows: (string|number)[][]}`
  - `csvForGroups(sessions): string`（先頭に BOM、改行は `\r\n`）

- [ ] **Step 1: 失敗するテストを書く**

import に `toExport, parseExport, fileBaseName, compareRows, csvForGroups` を加える。

```js
import {
  formatSeconds, todayString, DEFAULT_TYPES, layoutPositions, createSession,
  elapsed, start, pause, resume, addTurn, setTurnType, undo, end, reopen,
  edges, lastEdge, memberStats, groupStats, typeShares,
  toExport, parseExport, fileBaseName, compareRows, csvForGroups,
} from '../js/model.js';
```

末尾に追加する。

```js
test('書き出しには記録中だけの項目を含めない', () => {
  eq(Object.keys(toExport(played())), [
    'app', 'version', 'group', 'topic', 'date', 'layout', 'members', 'types', 'turns', 'startedAt', 'totalSeconds',
  ]);
});

test('書き出したものを読み込むと同じ集計になる', () => {
  const s = played();
  const r = parseExport(JSON.stringify(toExport(s)));
  eq(r.ok, true);
  eq(r.session.status, 'ended');
  eq(memberStats(r.session, 0), memberStats(s, 0));
  eq(groupStats(r.session, 0), groupStats(s, 0));
});

test('読み込めないファイルは理由を返す', () => {
  eq(parseExport('{'), { ok: false, error: 'JSONとして読めません' });
  eq(parseExport('{"app":"other"}'), { ok: false, error: 'このアプリの記録ファイルではありません' });
  const v2 = { ...toExport(played()), version: 2 };
  eq(parseExport(JSON.stringify(v2)), { ok: false, error: '対応していない形式です（version 2）' });
  const broken = toExport(played());
  broken.turns[0].member = 'zz';
  eq(parseExport(JSON.stringify(broken)), { ok: false, error: '記録ファイルの中身が壊れています' });
});

test('ファイル名は 班名_日付 で、使えない文字は _ にする', () => {
  const s = played();
  s.group = '3班 A/B';
  eq(fileBaseName(s), '3班_A_B_2026-11-03');
});

test('比較表は班ごとに1行、種類はすべての班の名前を合わせる', () => {
  const a = played();
  const b = played();
  b.group = '2班';
  b.types[0].label = '問い';
  const { headers, rows } = compareRows([a, b]);
  eq(headers, ['班', 'テーマ', '人数', '発言の総数', '討論の時間（秒）', '発言0回の人数',
    '質問（%）', '根拠（%）', '反論（%）', 'つなぐ（%）', 'まとめ（%）', '問い（%）']);
  eq(rows[0], ['1班', 'T', 3, 3, 50, 1, 67, 33, 0, 0, 0, 0]);
  eq(rows[1], ['2班', 'T', 3, 3, 50, 1, 0, 33, 0, 0, 0, 67]);
});

test('CSV は BOM 付きで、カンマや引用符を含む値は囲む', () => {
  const s = played();
  s.topic = 'a,"b"';
  const csv = csvForGroups([s]);
  eq(csv.startsWith('﻿班,テーマ,'), true);
  eq(csv.split('\r\n')[1].startsWith('1班,"a,""b""",3,'), true);
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm test`
Expected: `does not provide an export named 'toExport'` のエラーで終了コード 1

- [ ] **Step 3: `js/model.js` の末尾に実装を追加する**

```js
const EXPORT_KEYS = ['app', 'version', 'group', 'topic', 'date', 'layout', 'members', 'types', 'turns', 'startedAt', 'totalSeconds'];
const BROKEN = '記録ファイルの中身が壊れています';

export function toExport(s) {
  const out = {};
  for (const k of EXPORT_KEYS) out[k] = s[k];
  return JSON.parse(JSON.stringify(out));
}

export function parseExport(text) {
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSONとして読めません' };
  }
  if (!d || d.app !== APP_ID) return { ok: false, error: 'このアプリの記録ファイルではありません' };
  if (d.version !== FORMAT_VERSION) return { ok: false, error: `対応していない形式です（version ${d.version}）` };
  if (!Array.isArray(d.members) || !Array.isArray(d.types) || !Array.isArray(d.turns)) return { ok: false, error: BROKEN };
  const ids = new Set(d.members.map((m) => m.id));
  const bad = d.turns.some((t) => !ids.has(t.member) || typeof t.start !== 'number' || typeof t.duration !== 'number');
  if (bad || typeof d.totalSeconds !== 'number') return { ok: false, error: BROKEN };
  return { ok: true, session: { ...d, status: 'ended', elapsedBefore: d.totalSeconds, runningSince: null } };
}

export function fileBaseName(s) {
  const group = (s.group || '班').replace(/[\\/:*?"<>|\s]+/g, '_');
  return `${group}_${s.date}`;
}

export function compareRows(sessions) {
  const labels = [];
  for (const s of sessions) for (const t of s.types) if (!labels.includes(t.label)) labels.push(t.label);
  const headers = ['班', 'テーマ', '人数', '発言の総数', '討論の時間（秒）', '発言0回の人数', ...labels.map((l) => `${l}（%）`)];
  const rows = sessions.map((s) => {
    const g = groupStats(s, 0);
    const shares = typeShares(s);
    return [s.group, s.topic, s.members.length, g.totalTurns, Math.round(g.totalSeconds), g.silentCount,
      ...labels.map((l) => Math.round((shares[l] || 0) * 100))];
  });
  return { headers, rows };
}

const csvCell = (v) => {
  const text = String(v);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function csvForGroups(sessions) {
  const { headers, rows } = compareRows(sessions);
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test`
Expected: `31/31 passed`

- [ ] **Step 5: コミット**

```bash
git add js/model.js tests/model.test.js
git commit -m "feat: 記録ファイルの書き出し・読み込みと比較表を追加"
```

---

### Task 5: 端末への保存とファイルの保存（storage）

**Files:**
- Create: `js/storage.js`
- Create: `tests/storage.test.js`
- Modify: `tests/run.mjs`, `tests/index.html`（`import './storage.test.js';` を `import './model.test.js';` の次の行に追加）

**Interfaces:**
- Produces（`js/storage.js` から export）:
  - `MAX_SETUPS = 10`
  - `createStore(backend?)`：`backend` を省くと localStorage を使う。`null` なら保存できない状態として動く。返すオブジェクト：
    - `saveCurrent(session): boolean`（保存できたら true）
    - `loadCurrent(): Session | null`
    - `clearCurrent(): void`
    - `listSetups(): Setup[]`（新しい順）
    - `saveSetup(setup): boolean`（同じ班名は置き換え、最大 10 件）
  - `downloadBlob(filename, blob)`、`downloadText(filename, text, mime)`、`readFileTexts(files: FileList | File[]): Promise<{name, text}[]>`（ブラウザ専用）
- `Setup` の形：`{group, topic, layout, members, types, savedAt}`

- [ ] **Step 1: 失敗するテストを書く（`tests/storage.test.js`）**

```js
import { test, eq } from './harness.js';
import { createStore, MAX_SETUPS } from '../js/storage.js';

function fakeBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('記録中のデータを保存して読み込める', () => {
  const store = createStore(fakeBackend());
  eq(store.saveCurrent({ group: '1班', turns: [] }), true);
  eq(store.loadCurrent(), { group: '1班', turns: [] });
  store.clearCurrent();
  eq(store.loadCurrent(), null);
});

test('壊れたデータは読み込まない', () => {
  const backend = fakeBackend();
  backend.setItem('spider.current', '{');
  eq(createStore(backend).loadCurrent(), null);
});

test('容量不足などで保存できないときは false を返す', () => {
  const backend = { ...fakeBackend(), setItem: () => { throw new Error('QuotaExceededError'); } };
  const store = createStore(backend);
  eq(store.saveCurrent({ group: '1班' }), false);
  eq(store.loadCurrent(), null);
});

test('端末の保存が使えなくても止まらない', () => {
  const store = createStore(null);
  eq(store.saveCurrent({ group: '1班' }), false);
  eq(store.loadCurrent(), null);
  eq(store.listSetups(), []);
  store.clearCurrent();
});

test('準備の設定は新しい順で、同じ班名は置き換える', () => {
  const store = createStore(fakeBackend());
  store.saveSetup({ group: 'A', topic: 'x' });
  store.saveSetup({ group: 'B', topic: 'z' });
  store.saveSetup({ group: 'A', topic: 'y' });
  eq(store.listSetups(), [{ group: 'A', topic: 'y' }, { group: 'B', topic: 'z' }]);
});

test(`準備の設定は最大 ${MAX_SETUPS} 件で、古いものから消える`, () => {
  const store = createStore(fakeBackend());
  for (let i = 0; i < 12; i++) store.saveSetup({ group: `g${i}` });
  const list = store.listSetups();
  eq(list.length, 10);
  eq(list[0].group, 'g11');
  eq(list[9].group, 'g2');
});
```

`tests/run.mjs` と `tests/index.html` の `import './model.test.js';` の次の行に追加する。

```js
import './storage.test.js';
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm test`
Expected: `js/storage.js` が見つからないエラー（`ERR_MODULE_NOT_FOUND`）で終了コード 1

- [ ] **Step 3: `js/storage.js` を作る**

```js
const CURRENT = 'spider.current';
const SETUPS = 'spider.setups';
export const MAX_SETUPS = 10;

function defaultBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createStore(backend = defaultBackend()) {
  const read = (key, fallback) => {
    try {
      const v = backend.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      backend.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };
  return {
    saveCurrent: (session) => write(CURRENT, session),
    loadCurrent: () => read(CURRENT, null),
    clearCurrent() {
      try {
        backend.removeItem(CURRENT);
      } catch {
        // 保存が使えない端末では消すものもない
      }
    },
    listSetups: () => read(SETUPS, []),
    saveSetup(setup) {
      const others = read(SETUPS, []).filter((x) => x.group !== setup.group);
      return write(SETUPS, [setup, ...others].slice(0, MAX_SETUPS));
    },
  };
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename, text, mime) {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export function readFileTexts(files) {
  return Promise.all([...files].map((f) => f.text().then(
    (text) => ({ name: f.name, text }),
    () => ({ name: f.name, text: '' }),
  )));
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm test`
Expected: `37/37 passed`

- [ ] **Step 5: コミット**

```bash
git add js/storage.js tests
git commit -m "feat: 端末への保存とファイルの保存を追加"
```

---

### Task 6: 蜘蛛の巣の図（web.js）

**Files:**
- Create: `js/dom.js`, `js/web.js`
- Create: `tests/web.html`（目で確かめるページ）

**Interfaces:**
- Consumes: Task 3 の `edges`, `lastEdge`
- Produces:
  - `js/dom.js`：`h(tag, attrs?, ...children): HTMLElement`。`attrs` の `onXxx` は `xxx` イベント（小文字）、`class` は className、`true` は空の属性、`null`/`undefined`/`false` は付けない
  - `js/web.js`：
    - `VIEW_W = 1000`, `VIEW_H = 625`
    - `createSvg(...classes): SVGSVGElement`
    - `renderWeb(svg, session, { onSeatDown?: (memberId, event) => void, highlightLast?: boolean, markSilent?: boolean, showCounts?: boolean = true, caption?: string })`。`session` は `members`, `types`, `turns` があればよい
    - `svgToPngBlob(svg, scale = 2): Promise<Blob>`

- [ ] **Step 1: `js/dom.js` を作る**

```js
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}
```

- [ ] **Step 2: `js/web.js` を作る**

```js
import { edges, lastEdge } from './model.js';

const NS = 'http://www.w3.org/2000/svg';
export const VIEW_W = 1000;
export const VIEW_H = 625;
const SEAT_R = 44;
const MAX_DOTS = 20;
const FONT = 'system-ui, "Noto Sans JP", sans-serif';

function el(tag, attrs = {}, text = null) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== null) node.textContent = text;
  return node;
}

const pos = (m) => ({ x: m.x * VIEW_W, y: m.y * VIEW_H });

export function createSvg(...classes) {
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add(...classes);
  return svg;
}

export function renderWeb(svg, session, { onSeatDown = null, highlightLast = false, markSilent = false, showCounts = true, caption = '' } = {}) {
  svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
  svg.replaceChildren(el('rect', { x: 0, y: 0, width: VIEW_W, height: VIEW_H, fill: '#ffffff' }));
  if (caption) svg.append(el('text', { x: 16, y: 32, 'font-size': 22, fill: '#333333', 'font-family': FONT }, caption));

  const byId = new Map(session.members.map((m) => [m.id, m]));
  const colorOf = new Map(session.types.map((t) => [t.id, t.color]));

  for (const e of edges(session.turns)) {
    const a = pos(byId.get(e.a));
    const b = pos(byId.get(e.b));
    svg.append(el('line', {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: '#9aa3ad', 'stroke-width': Math.min(2 + e.count * 2, 16), 'stroke-linecap': 'round',
    }));
  }

  const last = highlightLast ? lastEdge(session.turns) : null;
  if (last) {
    const a = pos(byId.get(last.from));
    const b = pos(byId.get(last.to));
    svg.append(el('line', {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: colorOf.get(last.type) ?? '#1d3557', 'stroke-width': 6, 'stroke-linecap': 'round',
    }));
  }

  const current = highlightLast ? session.turns.at(-1)?.member : null;
  for (const m of session.members) {
    const p = pos(m);
    const mine = session.turns.filter((t) => t.member === m.id);
    const silent = markSilent && mine.length === 0;
    const g = el('g', { class: 'seat', 'data-id': m.id });
    g.append(el('circle', {
      cx: p.x, cy: p.y, r: SEAT_R,
      fill: m.id === current ? '#ffe8a3' : '#f1f4f8',
      stroke: silent ? '#d64545' : '#1d3557',
      'stroke-width': silent ? 4 : 2,
      'stroke-dasharray': silent ? '8 6' : 'none',
    }));
    const name = m.name.length > 7 ? m.name.slice(0, 7) : m.name;
    const size = name.length <= 3 ? 22 : name.length <= 5 ? 17 : 14;
    g.append(el('text', {
      x: p.x, y: showCounts ? p.y + 2 : p.y + size / 3, 'text-anchor': 'middle',
      'font-size': size, 'font-weight': 700, fill: '#1d2733', 'font-family': FONT,
    }, name));
    if (showCounts) {
      g.append(el('text', {
        x: p.x, y: p.y + 24, 'text-anchor': 'middle', 'font-size': 14,
        fill: silent ? '#d64545' : '#5b6673', 'font-family': FONT,
      }, `${mine.length}回`));
    }
    mine.filter((t) => t.type && colorOf.has(t.type)).slice(0, MAX_DOTS).forEach((t, i) => {
      const a = ((-90 + i * 18) * Math.PI) / 180;
      g.append(el('circle', {
        cx: p.x + (SEAT_R + 10) * Math.cos(a), cy: p.y + (SEAT_R + 10) * Math.sin(a), r: 5, fill: colorOf.get(t.type),
      }));
    });
    if (onSeatDown) g.addEventListener('pointerdown', (ev) => onSeatDown(m.id, ev));
    svg.append(g);
  }
}

export function svgToPngBlob(svg, scale = 2) {
  const copy = svg.cloneNode(true);
  copy.setAttribute('xmlns', NS);
  copy.setAttribute('width', VIEW_W);
  copy.setAttribute('height', VIEW_H);
  const xml = new XMLSerializer().serializeToString(copy);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = VIEW_W * scale;
      canvas.height = VIEW_H * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を作れませんでした'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を作れませんでした'));
    };
    img.src = url;
  });
}
```

- [ ] **Step 3: 見た目の確認ページ `tests/web.html` を作る**

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>図の確認</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 16px; background: #f6f7f9; }
  svg { display: block; width: 640px; aspect-ratio: 1000 / 625; border: 1px solid #d5dbe2; margin-bottom: 16px; }
  img { width: 640px; border: 1px solid #d5dbe2; }
</style>
</head>
<body>
<h2>記録中（最後の線を強調）</h2><div id="live"></div>
<h2>結果（発言0回を強調、見出し付き）</h2><div id="result"></div>
<h2>準備（回数なし）</h2><div id="preview"></div>
<button id="png">PNG にする</button><div id="out"></div>
<script type="module">
  import { createSession, DEFAULT_TYPES, layoutPositions, start, addTurn, setTurnType } from '../js/model.js';
  import { createSvg, renderWeb, svgToPngBlob } from '../js/web.js';

  const names = ['12', '3', 'たなか', '25', 'さとう花子', '7'];
  const members = layoutPositions('circle', 6).map((p, i) => ({ id: `m${i + 1}`, name: names[i], ...p }));
  const s = start(createSession({ group: '3班', topic: '制服は必要か', date: '2026-11-03', layout: 'circle', members, types: DEFAULT_TYPES }), 0);
  const plan = [['m1', 't1'], ['m2', 't2'], ['m1', null], ['m3', 't3'], ['m2', 't4'], ['m1', 't1'], ['m4', 't5']];
  plan.forEach(([m, t], i) => { addTurn(s, m, i * 10000); if (t) setTurnType(s, t); });

  const put = (id, opts) => { const svg = createSvg(); renderWeb(svg, s, opts); document.getElementById(id).append(svg); return svg; };
  put('live', { highlightLast: true });
  const resultSvg = put('result', { markSilent: true, caption: '3班　制服は必要か　2026-11-03' });
  put('preview', { showCounts: false });

  document.getElementById('png').onclick = async () => {
    const img = new Image();
    img.src = URL.createObjectURL(await svgToPngBlob(resultSvg));
    document.getElementById('out').replaceChildren(img);
  };
</script>
</body>
</html>
```

- [ ] **Step 4: ブラウザで確かめる**

Run: `npm run serve`（または `.claude/launch.json` の `spider` を起動）し、`http://localhost:8080/tests/web.html` を開く。
Expected:
- 記録中の図：m1–m2 の線がほかより太い。m1→m4 の最後の線が「まとめ」の紫で太く描かれ、m4 の席が黄色。
- 結果の図：席 5・6 が赤い点線の円で「0回」が赤字。左上に見出し。
- 準備の図：「○回」の表示がない。
- 各席のまわりに、付けた種類の色の点がある（m1 は青い点 2 個）。
- 「PNG にする」を押すと、結果の図と同じ画像（日本語の名前も表示）が出る。
- `http://localhost:8080/tests/index.html` で `37/37 passed`。
- コンソールにエラーがない。

- [ ] **Step 5: コミット**

```bash
git add js/dom.js js/web.js tests/web.html
git commit -m "feat: 蜘蛛の巣の図を SVG で描く"
```

---

### Task 7: アプリの骨組みとホーム画面

**Files:**
- Create: `index.html`, `css/style.css`, `js/app.js`

**Interfaces:**
- Consumes: `h`（Task 6）、`createStore`（Task 5）、`pause`（Task 2）
- Produces: 画面の切り替え。各画面のファイルは次の関数を export し、画面を閉じるときの後片付け関数を返してよい（返さなくてもよい）。`app.js` は画面のファイルを開くときに読み込む（dynamic import）ので、まだ無い画面は押したときだけエラーになる。
  - `js/setup.js`：`renderSetup(root, { store, onStart(session), onCancel() })`
  - `js/record.js`：`renderRecord(root, session, { store, onEnd(), onHome() })`
  - `js/result.js`：`renderResult(root, session, { store, onBack(), onHome() })`、`memberTable(session, stats)`
  - `js/teacher.js`：`renderTeacher(root, { onHome() })`

- [ ] **Step 1: `index.html` を作る**

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>スパイダー討論</title>
<meta name="theme-color" content="#1d3557">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="manifest" href="manifest.json">
<link rel="stylesheet" href="css/style.css">
</head>
<body>
<main id="app"></main>
<script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `css/style.css` を作る**

```css
:root {
  --ink: #1d2733;
  --muted: #5b6673;
  --line: #d5dbe2;
  --bg: #f6f7f9;
  --panel: #ffffff;
  --accent: #1d3557;
  --accent-ink: #ffffff;
  --danger: #c0392b;
  --alert: #d64545;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body { background: var(--bg); color: var(--ink); font-family: system-ui, "Noto Sans JP", sans-serif; font-size: 16px; }
#app { min-height: 100vh; display: flex; flex-direction: column; }

button, .button {
  font: inherit; min-height: 44px; padding: 0 16px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--panel); color: var(--ink); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
button:disabled { opacity: 0.4; cursor: default; }
button.primary { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
button.danger { color: var(--danger); border-color: var(--danger); }
button.big { min-height: 56px; font-size: 18px; padding: 0 24px; }
input, select { font: inherit; min-height: 40px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--ink); }
label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: var(--muted); }
.row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.row.end { justify-content: flex-end; }
.hint { color: var(--muted); font-size: 14px; margin: 0; }
.error { color: var(--danger); min-height: 1.2em; margin: 0; }
.warn { margin: 0; padding: 8px 16px; background: #fdecea; color: var(--danger); }
.alert { color: var(--alert); font-weight: 600; }

.bar { display: flex; align-items: center; gap: 12px; padding: 8px 16px; background: var(--panel); border-bottom: 1px solid var(--line); }
.bar h2 { margin: 0; font-size: 18px; flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.timer { font-variant-numeric: tabular-nums; font-size: 22px; font-weight: 600; }

.home { width: 100%; max-width: 640px; margin: 10vh auto 0; padding: 0 16px; text-align: center; }
.home h1 { font-size: 32px; }
.home-buttons { display: flex; flex-direction: column; gap: 16px; margin-top: 32px; }
.notice { background: #fff7e0; border: 1px solid #f0d58a; border-radius: 8px; padding: 12px 16px; text-align: left; }

.setup { width: 100%; max-width: 960px; margin: 0 auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.setup h3 { margin: 12px 0 0; font-size: 16px; }
.names { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.types { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.type-row input[type="color"] { width: 48px; padding: 2px; }

.web { display: block; width: 100%; aspect-ratio: 1000 / 625; background: #fff; border: 1px solid var(--line); border-radius: 8px; user-select: none; }
.web.live, .web.preview { touch-action: none; }
.web.live .seat, .web.preview .seat { cursor: pointer; }
.web.disabled .seat { opacity: 0.55; }
.stage { display: flex; justify-content: center; padding: 8px 16px; }
.stage .web.live { width: min(100%, calc((100vh - 210px) * 1.6)); }

.type-bar { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; align-items: center; padding: 4px 16px; min-height: 56px; }
.type-bar .type { border: 2px solid var(--c); color: var(--c); background: #fff; font-weight: 600; }
.type-bar .type.on { background: var(--c); color: #fff; }
.controls { display: flex; gap: 12px; justify-content: center; padding: 8px 16px 16px; }

.result { display: grid; grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr); gap: 16px; padding: 16px; }
.result .stage { padding: 0; align-items: flex-start; }
.side { display: flex; flex-direction: column; gap: 12px; }
.summary { margin: 0; padding-left: 20px; line-height: 1.8; }
table.stats { border-collapse: collapse; width: 100%; background: #fff; font-size: 14px; }
table.stats th, table.stats td { border: 1px solid var(--line); padding: 6px 8px; text-align: right; white-space: nowrap; }
table.stats th:first-child, table.stats td:first-child { text-align: left; }
table.stats tr.silent td { background: #fdecea; color: var(--alert); font-weight: 600; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--c); margin-right: 4px; }

.drop { margin: 16px; padding: 24px; border: 2px dashed var(--line); border-radius: 12px; text-align: center; background: #fff; }
.drop.over { border-color: var(--accent); background: #eef3fa; }
.drop input[type="file"] { display: none; }
.teacher { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 16px; }
.errors { background: #fdecea; border-radius: 8px; padding: 8px 16px; color: var(--danger); }
.table-wrap { overflow-x: auto; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
button.card { flex-direction: column; align-items: stretch; text-align: left; padding: 8px; gap: 6px; }
button.card .web { border: none; }
dialog.detail { width: min(1100px, 95vw); max-height: 92vh; border: none; border-radius: 12px; padding: 16px; }
dialog.detail .row { justify-content: space-between; }

@media (max-width: 900px) {
  .result { grid-template-columns: 1fr; }
}
```

- [ ] **Step 3: `js/app.js` を作る**

```js
import { h } from './dom.js';
import { createStore } from './storage.js';
import { pause } from './model.js';

const root = document.getElementById('app');
const store = createStore();
let cleanup = null;

function mount(render) {
  if (cleanup) cleanup();
  root.replaceChildren();
  cleanup = render(root) || null;
  window.scrollTo(0, 0);
}

async function screen(path, name, ...args) {
  let render;
  try {
    render = (await import(path))[name];
  } catch (err) {
    console.error(err);
    alert('画面を読み込めませんでした。ページを再読み込みしてください。');
    return;
  }
  mount((el) => render(el, ...args));
}

function goHome() {
  mount(renderHome);
}

function goSetup() {
  screen('./setup.js', 'renderSetup', {
    store,
    onStart: (session) => {
      store.saveCurrent(session);
      goRecord(session);
    },
    onCancel: goHome,
  });
}

function goRecord(session) {
  screen('./record.js', 'renderRecord', session, { store, onEnd: () => goResult(session), onHome: goHome });
}

function goResult(session) {
  screen('./result.js', 'renderResult', session, { store, onBack: () => goRecord(session), onHome: goHome });
}

function goTeacher() {
  screen('./teacher.js', 'renderTeacher', { onHome: goHome });
}

function continueRecord(session) {
  // 開き直したとき、タブを閉じていた間の時間は数えない
  if (session.status === 'running') pause(session, session.savedAt ?? Date.now());
  goRecord(session);
}

function pendingNotice(s) {
  const ended = s.status === 'ended';
  return h('div', { class: 'notice' },
    h('p', {}, ended ? `前回の記録（${s.group}）の結果を見られます。` : `終わっていない記録があります（${s.group}）。`),
    h('div', { class: 'row' },
      h('button', { class: 'primary', onClick: () => (ended ? goResult(s) : continueRecord(s)) }, ended ? '結果を見る' : '続きから記録する'),
      h('button', {
        onClick: () => {
          if (!confirm('この記録を破棄しますか？')) return;
          store.clearCurrent();
          goHome();
        },
      }, '破棄する')));
}

function renderHome(el) {
  const pending = store.loadCurrent();
  el.append(h('section', { class: 'home' },
    h('h1', {}, 'スパイダー討論'),
    pending ? pendingNotice(pending) : null,
    h('div', { class: 'home-buttons' },
      h('button', { class: 'big primary', onClick: goSetup }, '記録係として使う'),
      h('button', { class: 'big', onClick: goTeacher }, '教師として使う'))));
}

goHome();
```

- [ ] **Step 4: ブラウザで確かめる**

サーバーを起動し、`http://localhost:8080/` を 1366×768 の画面で開く。
Expected:
- 「スパイダー討論」の見出しと、「記録係として使う」「教師として使う」の大きなボタンが出る。
- ブラウザのコンソールで `localStorage.setItem('spider.current', JSON.stringify({group:'1班',status:'paused',turns:[]}))` を実行して再読み込みすると、「終わっていない記録があります（1班）。」と「続きから記録する」「破棄する」が出る。「破棄する」→ 確認で OK → 案内が消える。
- 「記録係として使う」を押すと「画面を読み込めませんでした」の警告が出る（setup.js は次のタスクで作るため。ここではこれが正しい）。
- `manifest.json` と `icon.svg` の 404 は Task 12 で解消するので、ここでは無視してよい。

- [ ] **Step 5: コミット**

```bash
git add index.html css js/app.js
git commit -m "feat: アプリの骨組みとホーム画面を追加"
```

---

### Task 8: 準備画面

**Files:**
- Create: `js/setup.js`

**Interfaces:**
- Consumes: `h`、`createSvg`・`renderWeb`（Task 6）、`DEFAULT_TYPES`・`MIN_MEMBERS`・`MAX_MEMBERS`・`MAX_TYPES`・`layoutPositions`・`createSession`・`todayString`（Task 1・2）、`store.listSetups()`・`store.saveSetup()`（Task 5）
- Produces: `renderSetup(root, { store, onStart(session), onCancel() })`。`onStart` には `createSession()` で作った `status: 'ready'` の記録を渡す。

- [ ] **Step 1: `js/setup.js` を作る**

```js
import { h } from './dom.js';
import { DEFAULT_TYPES, MIN_MEMBERS, MAX_MEMBERS, MAX_TYPES, layoutPositions, createSession, todayString } from './model.js';
import { createSvg, renderWeb } from './web.js';

const LAYOUTS = [['circle', '円形'], ['rect', '長方形'], ['free', '自由配置']];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round3 = (v) => Math.round(v * 1000) / 1000;

function makeMembers(layout, count, old) {
  return layoutPositions(layout, count).map((p, i) => ({ id: `m${i + 1}`, name: old[i]?.name ?? String(i + 1), ...p }));
}

function blankSetup() {
  return { group: '', topic: '', layout: 'circle', members: makeMembers('circle', 6, []), types: DEFAULT_TYPES.map((t) => ({ ...t })) };
}

export function renderSetup(root, { store, onStart, onCancel }) {
  let setup = blankSetup();
  const saved = store.listSetups();
  const form = h('div', { class: 'setup' });
  const preview = createSvg('web', 'preview');
  const error = h('p', { class: 'error' });

  root.append(h('header', { class: 'bar' }, h('button', { onClick: onCancel }, '← もどる'), h('h2', {}, '準備')), form);

  function redrawPreview() {
    renderWeb(preview, { members: setup.members, types: setup.types, turns: [] }, { onSeatDown: startDrag, showCounts: false });
  }

  function startDrag(id, ev) {
    ev.preventDefault();
    const m = setup.members.find((x) => x.id === id);
    const move = (e) => {
      const r = preview.getBoundingClientRect();
      m.x = round3(clamp((e.clientX - r.left) / r.width, 0.06, 0.94));
      m.y = round3(clamp((e.clientY - r.top) / r.height, 0.08, 0.92));
      redrawPreview();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function field(label, key, placeholder) {
    return h('label', {}, label, h('input', { value: setup[key], placeholder, maxlength: 40, onInput: (e) => { setup[key] = e.target.value; } }));
  }

  const nextTypeId = () => {
    let n = 1;
    while (setup.types.some((t) => t.id === `t${n}`)) n++;
    return `t${n}`;
  };

  function typesEditor() {
    return h('div', { class: 'types' },
      ...setup.types.map((t, i) => h('div', { class: 'row type-row' },
        h('input', { type: 'color', value: t.color, onInput: (e) => { t.color = e.target.value; redrawPreview(); } }),
        h('input', { value: t.label, maxlength: 8, onInput: (e) => { t.label = e.target.value; } }),
        h('button', { onClick: () => { setup.types.splice(i, 1); draw(); } }, '削除'))),
      setup.types.length < MAX_TYPES
        ? h('button', { onClick: () => { setup.types.push({ id: nextTypeId(), label: '新しい種類', color: '#555555' }); draw(); } }, '＋ 種類を追加')
        : null);
  }

  function draw() {
    redrawPreview();
    form.replaceChildren(
      saved.length
        ? h('label', {}, '前回の設定を使う', h('select', {
          onChange: (e) => {
            const s = saved[e.target.value];
            if (!s) return;
            setup = structuredClone(s);
            draw();
          },
        }, h('option', { value: '' }, '選んでください'), ...saved.map((s, i) => h('option', { value: i }, `${s.group}（${s.topic || 'テーマなし'}）`))))
        : null,
      field('班の名前', 'group', '例：3班'),
      field('討論のテーマ', 'topic', ''),
      h('div', { class: 'row' },
        h('label', {}, '人数', h('select', {
          onChange: (e) => { setup.members = makeMembers(setup.layout, Number(e.target.value), setup.members); draw(); },
        }, ...range(MIN_MEMBERS, MAX_MEMBERS).map((n) => h('option', { value: n, selected: n === setup.members.length }, `${n}人`)))),
        h('label', {}, '座席の並び', h('select', {
          onChange: (e) => { setup.layout = e.target.value; setup.members = makeMembers(setup.layout, setup.members.length, setup.members); draw(); },
        }, ...LAYOUTS.map(([v, label]) => h('option', { value: v, selected: v === setup.layout }, label))))),
      h('p', { class: 'hint' }, '席をドラッグすると位置を動かせます。名前は出席番号でもかまいません（提出するファイルに名前を入れたくないときは出席番号にしてください）。'),
      preview,
      h('h3', {}, 'メンバー'),
      h('div', { class: 'names' }, ...setup.members.map((m, i) => h('label', {}, `席${i + 1}`,
        h('input', { value: m.name, maxlength: 12, onInput: (e) => { m.name = e.target.value; redrawPreview(); } })))),
      h('h3', {}, '発言の種類'),
      typesEditor(),
      error,
      h('div', { class: 'row end' }, h('button', { class: 'big primary', onClick: submit }, '記録をはじめる')));
  }

  function submit() {
    setup.group = setup.group.trim();
    setup.topic = setup.topic.trim();
    for (const m of setup.members) m.name = m.name.trim();
    if (!setup.group) {
      error.textContent = '班の名前を入れてください。';
      return;
    }
    if (setup.members.some((m) => !m.name)) {
      error.textContent = '名前が空の席があります。';
      return;
    }
    setup.types = setup.types.map((t) => ({ ...t, label: t.label.trim() })).filter((t) => t.label);
    store.saveSetup({ ...structuredClone(setup), savedAt: new Date().toISOString() });
    onStart(createSession({ ...setup, date: todayString() }));
  }

  draw();
}
```

- [ ] **Step 2: ブラウザで確かめる**

`http://localhost:8080/` を開き（`localStorage.clear()` してから）、「記録係として使う」を押す。
Expected:
- 6 人・円形の座席図、席 1〜6、発言の種類 5 つ（色付き）が出る。
- 人数を 8 人にすると席が 8 つになり、入力済みの名前が残る。並びを「長方形」にすると上下 2 列に並ぶ。
- 席をドラッグ（マウスでもタッチでも）すると動き、図の外には出ない。
- 名前を変えると図の名前も変わる。
- 種類を「＋ 種類を追加」で 8 個にすると追加ボタンが消える。「削除」で減る。
- 班の名前を空のまま「記録をはじめる」→「班の名前を入れてください。」が出る。
- 班の名前を入れて「記録をはじめる」→「画面を読み込めませんでした」の警告（record.js は次のタスク）。コンソールで `JSON.parse(localStorage['spider.current']).status` が `"ready"`、`JSON.parse(localStorage['spider.setups']).length` が `1`。
- ホームに戻って再び「記録係として使う」を押すと「前回の設定を使う」が出て、選ぶと前回の名前・配置・種類が戻る。

- [ ] **Step 3: コミット**

```bash
git add js/setup.js
git commit -m "feat: 準備画面を追加"
```

---

### Task 9: 記録画面

**Files:**
- Create: `js/record.js`

**Interfaces:**
- Consumes: `h`、`createSvg`・`renderWeb`、`start`・`pause`・`resume`・`addTurn`・`setTurnType`・`undo`・`end`・`elapsed`・`formatSeconds`、`store.saveCurrent()`
- Produces: `renderRecord(root, session, { store, onEnd(), onHome() })`。後片付け関数を返す（タイマーと `pagehide` の監視を止める）。保存のたびに `session.savedAt = Date.now()` を入れる（Task 7 の `continueRecord` が使う）。

- [ ] **Step 1: `js/record.js` を作る**

```js
import { h } from './dom.js';
import { start, pause, resume, addTurn, setTurnType, undo, end, elapsed, formatSeconds } from './model.js';
import { createSvg, renderWeb } from './web.js';

export function renderRecord(root, session, { store, onEnd, onHome }) {
  const svg = createSvg('web', 'live');
  const timer = h('span', { class: 'timer' });
  const typeBar = h('div', { class: 'type-bar' });
  const controls = h('div', { class: 'controls' });
  const warn = h('p', { class: 'warn', hidden: true }, 'この端末に保存できませんでした。終了後、すぐに「提出用に保存」をしてください。');
  const nameOf = (id) => session.members.find((m) => m.id === id)?.name ?? '';

  root.append(
    h('header', { class: 'bar' },
      h('button', { onClick: () => { act(() => pause(session, Date.now())); onHome(); } }, '← ホーム'),
      h('h2', {}, `${session.group}　${session.topic}`),
      timer),
    warn,
    h('div', { class: 'stage' }, svg),
    typeBar,
    controls);

  function save() {
    session.savedAt = Date.now();
    warn.hidden = store.saveCurrent(session);
  }

  function act(fn) {
    fn();
    save();
    draw();
  }

  function tick() {
    timer.textContent = (session.status === 'paused' ? '一時停止中 ' : '') + formatSeconds(elapsed(session, Date.now()));
  }

  function drawTypeBar() {
    const last = session.turns[session.turns.length - 1];
    if (!last) {
      typeBar.replaceChildren(h('span', { class: 'hint' },
        session.status === 'ready' ? '「開始」を押してから、話した人の席をタップします。' : '話した人の席をタップします。'));
      return;
    }
    typeBar.replaceChildren(
      h('span', { class: 'hint' }, `${nameOf(last.member)} の発言：`),
      ...session.types.map((t) => h('button', {
        class: last.type === t.id ? 'type on' : 'type',
        style: `--c:${t.color}`,
        onClick: () => act(() => setTurnType(session, t.id)),
      }, t.label)));
  }

  function draw() {
    renderWeb(svg, session, { highlightLast: true, onSeatDown: (id) => act(() => addTurn(session, id, Date.now())) });
    svg.classList.toggle('disabled', session.status !== 'running');
    drawTypeBar();
    const { status } = session;
    controls.replaceChildren(
      status === 'ready' ? h('button', { class: 'big primary', onClick: () => act(() => start(session, Date.now())) }, '開始') : null,
      status === 'running' ? h('button', { class: 'big', onClick: () => act(() => pause(session, Date.now())) }, '一時停止') : null,
      status === 'paused' ? h('button', { class: 'big primary', onClick: () => act(() => resume(session, Date.now())) }, '再開') : null,
      h('button', { class: 'big', disabled: status === 'ready' || !session.turns.length, onClick: () => act(() => undo(session)) }, '取り消し'),
      h('button', {
        class: 'big danger',
        disabled: status === 'ready',
        onClick: () => {
          if (!confirm('討論の記録を終了しますか？')) return;
          act(() => end(session, Date.now()));
          onEnd();
        },
      }, '終了'));
    tick();
  }

  const timerId = setInterval(tick, 500);
  const saveId = setInterval(save, 5000);
  window.addEventListener('pagehide', save);
  draw();

  return () => {
    clearInterval(timerId);
    clearInterval(saveId);
    window.removeEventListener('pagehide', save);
  };
}
```

- [ ] **Step 2: ブラウザで確かめる**

準備画面から 4 人で「記録をはじめる」を押す。
Expected:
- 座席図が画面いっぱいに出て、席は薄く表示。「開始」を押すまで席をタップしても何も起きない。
- 「開始」→ 時間が進む。席 1 → 席 2 → 席 1 → 席 3 とタップすると、1–2 の線が 1–3 より太く、最後の 1→3 の線が濃い色で、席 3 が黄色。
- 席をタップすると下に種類のボタンが出る。「反論」を押すと塗りつぶし表示になり、最後の線が赤になり、席 3 のまわりに赤い点が付く。もう一度押すと外れる。
- 「取り消し」で最後の発言が消え、図が 1 つ前に戻る。
- 「一時停止」→「一時停止中」と出て時間が止まり、タップを受け付けない。「再開」で再び進む。
- 記録中にページを再読み込み → ホームに「終わっていない記録があります」→「続きから記録する」で同じ図に戻り、一時停止の状態になっている。時間は再読み込み前とほぼ同じ（閉じていた間は数えない）。
- 1366×768 で、図・種類のボタン・操作ボタンがスクロールなしで全部見える。
- 「終了」→ 確認で OK →「画面を読み込めませんでした」（result.js は次のタスク）。`JSON.parse(localStorage['spider.current']).status` が `"ended"`。

- [ ] **Step 3: コミット**

```bash
git add js/record.js
git commit -m "feat: 記録画面を追加"
```

---

### Task 10: 結果画面と提出用の保存

**Files:**
- Create: `js/result.js`

**Interfaces:**
- Consumes: `h`、`createSvg`・`renderWeb`・`svgToPngBlob`、`reopen`・`memberStats`・`groupStats`・`toExport`・`fileBaseName`・`formatSeconds`、`downloadText`・`downloadBlob`、`store.saveCurrent()`
- Produces:
  - `renderResult(root, session, { store, onBack(), onHome() })`
  - `memberTable(session, stats): HTMLTableElement`（Task 11 でも使う。`stats` は `memberStats()` の戻り値）

- [ ] **Step 1: `js/result.js` を作る**

```js
import { h } from './dom.js';
import { reopen, memberStats, groupStats, toExport, fileBaseName, formatSeconds } from './model.js';
import { createSvg, renderWeb, svgToPngBlob } from './web.js';
import { downloadText, downloadBlob } from './storage.js';

export function memberTable(session, stats) {
  return h('table', { class: 'stats' },
    h('thead', {}, h('tr', {},
      h('th', {}, '名前'), h('th', {}, '回数'), h('th', {}, '時間'),
      ...session.types.map((t) => h('th', {}, h('span', { class: 'dot', style: `--c:${t.color}` }), t.label)))),
    h('tbody', {}, ...stats.map((m) => h('tr', { class: m.count === 0 ? 'silent' : null },
      h('td', {}, m.name), h('td', {}, m.count), h('td', {}, formatSeconds(m.seconds)),
      ...session.types.map((t) => h('td', {}, m.byType[t.id] || 0))))));
}

export function renderResult(root, session, { store, onBack, onHome }) {
  const svg = createSvg('web');
  renderWeb(svg, session, { markSilent: true, caption: `${session.group}　${session.topic}　${session.date}` });
  const g = groupStats(session, 0);
  const status = h('p', { class: 'hint' });

  async function saveFiles() {
    const base = fileBaseName(session);
    downloadText(`${base}.json`, JSON.stringify(toExport(session), null, 2), 'application/json');
    try {
      downloadBlob(`${base}.png`, await svgToPngBlob(svg));
      status.textContent = `「${base}.json」と「${base}.png」を保存しました。ダウンロードフォルダから Classroom に添付して提出してください。`;
    } catch (err) {
      status.textContent = `記録ファイルは保存しましたが、画像を作れませんでした（${err.message}）。`;
    }
  }

  root.append(
    h('header', { class: 'bar' }, h('button', { onClick: onHome }, '← ホーム'), h('h2', {}, `結果：${session.group}`)),
    h('div', { class: 'result' },
      h('div', { class: 'stage' }, svg),
      h('div', { class: 'side' },
        h('ul', { class: 'summary' },
          h('li', {}, `発言の総数：${g.totalTurns}回`),
          h('li', {}, `討論の時間：${formatSeconds(g.totalSeconds)}`),
          h('li', {}, `いちばん多い人：${g.maxCount}回／いちばん少ない人：${g.minCount}回`),
          h('li', { class: g.silentCount ? 'alert' : null }, `発言0回の人：${g.silentCount}人`)),
        memberTable(session, memberStats(session, 0)),
        h('div', { class: 'row' },
          h('button', { class: 'big primary', onClick: saveFiles }, '提出用に保存'),
          h('button', {
            onClick: () => {
              reopen(session);
              store.saveCurrent(session);
              onBack();
            },
          }, '記録に戻る')),
        status)));
}
```

- [ ] **Step 2: ブラウザで確かめる**

4 人で記録し、1 人は一度もタップせずに「終了」する。
Expected:
- 結果画面に図（左上に班名・テーマ・日付、発言 0 回の席は赤い点線）と、一人ずつの表（0 回の人の行が赤）、班全体の集計が出る。表の回数・時間・種類の数が、記録した内容と合う。
- 「提出用に保存」で `班名_日付.json` と `班名_日付.png` の 2 つがダウンロードされる（Chrome が「複数のファイルのダウンロード」の許可を求めたら許可する）。保存先を案内する文が出る。
- ダウンロードした PNG を開くと、画面と同じ図が日本語の名前つきで描かれている。
- JSON を開くと、設計書 6 章の項目だけ（`status` などがない）。
- 「記録に戻る」→ 記録画面に戻り、一時停止の状態。「再開」してタップを続けられる。
- ホームに戻ると「前回の記録（○班）の結果を見られます。」→「結果を見る」で結果画面に戻れる。

- [ ] **Step 3: コミット**

```bash
git add js/result.js
git commit -m "feat: 結果画面と提出用の保存を追加"
```

---

### Task 11: 集約画面（教師）

**Files:**
- Create: `js/teacher.js`

**Interfaces:**
- Consumes: `h`、`createSvg`・`renderWeb`、`parseExport`・`groupStats`・`memberStats`・`compareRows`・`csvForGroups`・`formatSeconds`・`todayString`、`readFileTexts`・`downloadText`、`memberTable`（Task 10）
- Produces: `renderTeacher(root, { onHome() })`

- [ ] **Step 1: `js/teacher.js` を作る**

```js
import { h } from './dom.js';
import { parseExport, groupStats, memberStats, compareRows, csvForGroups, formatSeconds, todayString } from './model.js';
import { createSvg, renderWeb } from './web.js';
import { readFileTexts, downloadText } from './storage.js';
import { memberTable } from './result.js';

export function renderTeacher(root, { onHome }) {
  let sessions = [];
  let errors = [];
  const body = h('div', { class: 'teacher' });
  const input = h('input', { type: 'file', accept: '.json,application/json', multiple: true, onChange: (e) => load(e.target.files) });
  const drop = h('div', { class: 'drop' },
    h('p', {}, '提出された記録ファイル（.json）を、ここにドラッグするか、ボタンで選んでください。'),
    h('label', { class: 'button' }, 'ファイルを選ぶ', input));

  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); load(e.dataTransfer.files); });

  root.append(h('header', { class: 'bar' }, h('button', { onClick: onHome }, '← ホーム'), h('h2', {}, '教師：班の比較')), drop, body);

  async function load(files) {
    for (const { name, text } of await readFileTexts(files)) {
      const r = parseExport(text);
      if (!r.ok) {
        errors.push({ fileName: name, error: r.error });
        continue;
      }
      const key = `${r.session.group}|${r.session.startedAt}`;
      if (sessions.some((x) => `${x.group}|${x.startedAt}` === key)) {
        errors.push({ fileName: name, error: '同じ記録がすでに読み込まれています' });
        continue;
      }
      sessions.push(r.session);
    }
    input.value = '';
    draw();
  }

  function detail(session) {
    const svg = createSvg('web');
    renderWeb(svg, session, { markSilent: true });
    const dlg = h('dialog', { class: 'detail' },
      h('div', { class: 'row' }, h('h3', {}, `${session.group}　${session.topic}`), h('button', { onClick: () => dlg.close() }, '閉じる')),
      svg,
      memberTable(session, memberStats(session, 0)));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  function card(session) {
    const svg = createSvg('web');
    renderWeb(svg, session, { markSilent: true });
    const g = groupStats(session, 0);
    return h('button', { class: 'card', onClick: () => detail(session) },
      h('strong', {}, `${session.group}　${session.topic}`),
      svg,
      h('span', { class: 'hint' }, `発言${g.totalTurns}回・${formatSeconds(g.totalSeconds)}・0回の人${g.silentCount}人`));
  }

  function compareTable() {
    const { headers, rows } = compareRows(sessions);
    return h('div', { class: 'table-wrap' }, h('table', { class: 'stats' },
      h('thead', {}, h('tr', {}, ...headers.map((x) => h('th', {}, x)))),
      h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((x) => h('td', {}, x)))))));
  }

  function draw() {
    body.replaceChildren(
      errors.length
        ? h('div', { class: 'errors' }, h('p', {}, '読み込めなかったファイル：'), h('ul', {}, ...errors.map((e) => h('li', {}, `${e.fileName}：${e.error}`))))
        : null,
      sessions.length
        ? h('div', { class: 'row' },
          h('button', { class: 'primary', onClick: () => downloadText(`班の比較_${todayString()}.csv`, csvForGroups(sessions), 'text/csv') }, '比較表を CSV で保存'),
          h('button', { onClick: () => { sessions = []; errors = []; draw(); } }, 'すべて閉じる'))
        : null,
      sessions.length ? compareTable() : null,
      h('div', { class: 'cards' }, ...sessions.map(card)));
  }

  draw();
}
```

- [ ] **Step 2: ブラウザで確かめる**

Task 10 で保存した JSON に加え、班名を変えてもう 1 つ記録・保存しておく。読み込めないファイルとして、中身が `{` だけの `broken.json` を作っておく。
Expected:
- ホーム →「教師として使う」で、ファイルを選ぶ欄が出る。
- 2 班分の JSON と `broken.json` をまとめて選ぶ（ドラッグでも可）と、2 班のカードと比較表が出て、上に「broken.json：JSONとして読めません」が出る。
- 同じ JSON をもう一度読み込むと「同じ記録がすでに読み込まれています」が出て、カードは増えない。
- カードを押すと大きな図と一人ずつの表が出て、「閉じる」で閉じる。
- 「比較表を CSV で保存」で `班の比較_日付.csv` が保存され、スプレッドシートで開いても文字化けしない。
- 「すべて閉じる」で空に戻る。

- [ ] **Step 3: コミット**

```bash
git add js/teacher.js
git commit -m "feat: 教師の集約画面を追加"
```

---

### Task 12: 通信なしで動かす（PWA）、使い方の説明、全体の確認

**Files:**
- Create: `sw.js`, `manifest.json`, `icon.svg`, `README.md`
- Modify: `js/app.js`（末尾の `goHome();` の直前にサービスワーカーの登録を追加）

**Interfaces:**
- Consumes: これまでのすべてのファイル
- Produces: 一度開けば通信なしで動くアプリ。`sw.js` の `FILES` はアプリ本体の全ファイル。

- [ ] **Step 1: `sw.js` を作る**

通信できるときは新しいファイルを取りに行き（先生が更新したらすぐ反映される）、できないときは保存しておいたファイルを使う。

```js
const CACHE = 'spider-v1';
const FILES = [
  './', 'index.html', 'manifest.json', 'icon.svg', 'css/style.css',
  'js/app.js', 'js/dom.js', 'js/model.js', 'js/web.js', 'js/storage.js',
  'js/setup.js', 'js/record.js', 'js/result.js', 'js/teacher.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request)
    .then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
```

- [ ] **Step 2: `manifest.json` を作る**

```json
{
  "name": "スパイダー討論",
  "short_name": "スパイダー討論",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f6f7f9",
  "theme_color": "#1d3557",
  "icons": [
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

- [ ] **Step 3: `icon.svg` を作る**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1d3557"/>
  <g stroke="#9fc3e6" stroke-width="14" stroke-linecap="round">
    <line x1="256" y1="110" x2="395" y2="300"/>
    <line x1="256" y1="110" x2="117" y2="300"/>
    <line x1="117" y1="300" x2="395" y2="300"/>
    <line x1="256" y1="110" x2="256" y2="410"/>
    <line x1="117" y1="300" x2="256" y2="410"/>
  </g>
  <line x1="395" y1="300" x2="256" y2="410" stroke="#ffd166" stroke-width="22" stroke-linecap="round"/>
  <g fill="#ffffff">
    <circle cx="256" cy="110" r="44"/>
    <circle cx="395" cy="300" r="44"/>
    <circle cx="117" cy="300" r="44"/>
    <circle cx="256" cy="410" r="44"/>
  </g>
</svg>
```

- [ ] **Step 4: `js/app.js` の末尾の `goHome();` の直前に、サービスワーカーの登録を追加する**

```js
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('サービスワーカーを登録できませんでした', err));
}
```

- [ ] **Step 5: `README.md` を作る**

```markdown
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

## 開発
- テスト：`npm test`（ブラウザでは `tests/index.html`）
- 確認用サーバー：`npm run serve` → `http://localhost:8080/`
- 図の見た目の確認：`http://localhost:8080/tests/web.html`
```

- [ ] **Step 6: テストを実行する**

Run: `npm test`
Expected: `37/37 passed`

- [ ] **Step 7: 全体の流れをブラウザで確かめる**

サーバーを起動し、1366×768 の画面で `localStorage.clear()` してから `http://localhost:8080/` を開く。
Expected:
- コンソールにエラーがない（`manifest.json`・`icon.svg` の 404 もない）。DevTools の Application でサービスワーカーが有効。
- 準備 → 記録（タップ・種類・取り消し・一時停止）→ 終了 → 提出用に保存 → ホーム → 教師として使う → 保存した JSON を読み込む、が最後まで通り、教師画面の数字が結果画面と同じ。
- タッチ操作（DevTools のデバイス表示でタッチを有効にする）でも、席のタップとドラッグができる。
- サーバーを止めてからページを再読み込みしても、アプリが開いて記録できる。

- [ ] **Step 8: コミット**

```bash
git add sw.js manifest.json icon.svg README.md js/app.js
git commit -m "feat: 通信なしで動くようにし、使い方の説明を追加"
```
