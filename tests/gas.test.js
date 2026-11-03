// gas/Code.gs を、にせものの Google（SpreadsheetApp など）の上で動かして確かめる。Node 専用
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, eq } from './harness.js';
import { createSession, DEFAULT_TYPES, start, addTurn, end, toExport } from '../js/model.js';

const CODE = readFileSync(new URL('../gas/Code.gs', import.meta.url), 'utf8');
const TEACHER = 'teacher@school.ed.jp';
const STUDENT = 'student@school.ed.jp';

function makeSheet() {
  const rows = [];
  const range = (r, c, nr, nc) => ({
    getValues: () => rows.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)),
    setValues: (vals) => vals.forEach((v, i) => v.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; })),
  });
  return {
    rows,
    appendRow: (r) => rows.push([...r]),
    setFrozenRows: () => {},
    getLastRow: () => rows.length,
    getRange: range,
  };
}

function load(user = TEACHER) {
  const sheets = {};
  const env = {
    user,
    sheets,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (n) => sheets[n] ?? null,
        insertSheet: (n) => (sheets[n] = makeSheet()),
      }),
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => env.user }),
      getEffectiveUser: () => ({ getEmail: () => TEACHER }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  };
  const ctx = vm.createContext(env);
  vm.runInContext(CODE, ctx);
  return ctx;
}

test('貼り付け用の1ファイルだけで、画面を返し記録も受け取れる', () => {
  const single = readFileSync(new URL('../deploy/apps-script.txt', import.meta.url), 'utf8');
  eq(single.includes('createHtmlOutputFromFile'), false);
  eq(single.includes('@OnlyCurrentDoc'), true);
  const g = load(STUDENT);
  g.HtmlService = {
    createHtmlOutput: (html) => {
      const out = { html, setTitle: () => out, addMetaTag: () => out };
      return out;
    },
  };
  vm.runInContext(single, g);
  const page = g.doGet().html;
  eq(page.includes('const __m_app'), true);
  eq(page.includes('スパイダー討論'), true);
  eq(page.startsWith('<!doctype html>'), true);
  // HtmlService は文字列の中の // まで「コメント」として消すので、1つも残してはいけない
  eq(page.includes('//'), false);
  eq(g.submitRecord(JSON.stringify(record())), { ok: true });
});

function record(group = '3班', date = '2026-11-03') {
  const members = [{ id: 'm1', name: '1', x: 0.3, y: 0.5 }, { id: 'm2', name: '2', x: 0.7, y: 0.5 }];
  const s = start(createSession({ group, topic: 'テーマ', date, layout: 'free', members, types: DEFAULT_TYPES }), 0);
  addTurn(s, 'm1', 0);
  addTurn(s, 'm2', 5000);
  end(s, 9000);
  return toExport(s);
}

test('Google側：受け取った記録を1行で保存し、送った生徒もわかる', () => {
  const g = load(STUDENT);
  const r = record();
  eq(g.submitRecord(JSON.stringify(r)), { ok: true });
  const rows = g.sheets['記録'].rows;
  eq(rows[0], ['受信日時', '日付', '班', 'テーマ', '送信者', '記録ID', '記録']);
  eq(rows.length, 2);
  eq(rows[1].slice(1), [`'2026-11-03`, `'3班`, `'テーマ`, `'${STUDENT}`, `'${r.id}`, JSON.stringify(r)]);
});

test('Google側：同じ記録がもう一度届いたら上書きする', () => {
  const g = load(STUDENT);
  const r = record();
  g.submitRecord(JSON.stringify(r));
  g.submitRecord(JSON.stringify({ ...r, topic: '変更後' }));
  const rows = g.sheets['記録'].rows;
  eq(rows.length, 2);
  eq(rows[1][3], `'変更後`);
});

test('Google側：形式の違うものや大きすぎるものは受け取らない', () => {
  const g = load(STUDENT);
  eq(g.submitRecord('{').ok, false);
  eq(g.submitRecord(JSON.stringify({ app: 'other' })).ok, false);
  eq(g.submitRecord(JSON.stringify({ ...record(), id: undefined })).ok, false);
  eq(g.submitRecord(JSON.stringify({ ...record(), date: '11/3' })).ok, false);
  const huge = record();
  huge.topic = 'あ'.repeat(46000);
  eq(g.submitRecord(JSON.stringify(huge)), { ok: false, error: '記録が大きすぎます' });
  eq(g.sheets['記録'], undefined);
});

test('Google側：数式のような班名もただの文字として保存する', () => {
  const g = load(STUDENT);
  g.submitRecord(JSON.stringify(record('=1+1')));
  eq(g.sheets['記録'].rows[1][2], `'=1+1`);
});

test('Google側：先生かどうかを判定する', () => {
  eq(load(TEACHER).isTeacher(), true);
  eq(load(STUDENT).isTeacher(), false);
  eq(load('').isTeacher(), false);
});

test('Google側：生徒は記録を読み出せない', () => {
  const g = load(STUDENT);
  g.submitRecord(JSON.stringify(record()));
  let error = '';
  try {
    g.getRecords('2026-11-03');
  } catch (err) {
    error = err.message;
  }
  eq(error, '先生のアカウントでのみ使えます');
  error = '';
  try {
    g.listDates();
  } catch (err) {
    error = err.message;
  }
  eq(error, '先生のアカウントでのみ使えます');
});

test('Google側：先生は日付の一覧とその日の記録を読み出せる', () => {
  const g = load(STUDENT);
  const a = record('1班', '2026-11-03');
  const b = record('2班', '2026-11-03');
  const c = record('1班', '2026-11-04');
  for (const r of [a, b, c]) g.submitRecord(JSON.stringify(r));
  g.user = TEACHER;
  eq(JSON.parse(JSON.stringify(g.listDates())), [{ date: '2026-11-04', count: 1 }, { date: '2026-11-03', count: 2 }]);
  const got = JSON.parse(JSON.stringify(g.getRecords('2026-11-03')));
  eq(got.map((x) => JSON.parse(x.json).group), ['1班', '2班']);
  eq(got[0].submitter, STUDENT);
  eq(typeof got[0].receivedAt, 'string');
});
