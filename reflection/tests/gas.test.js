// gas/Code.gs を、にせものの Google（SpreadsheetApp など）の上で動かして確かめる。Node 専用
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, eq } from './harness.js';
import { emptyDraft, buildRecord } from '../js/model.js';

const CODE = readFileSync(new URL('../gas/Code.gs', import.meta.url), 'utf8');
const TEACHER = 'teacher@school.ed.jp';
const STUDENT = 'student@school.ed.jp';

function makeSheet() {
  const rows = [];
  return {
    rows,
    appendRow: (r) => rows.push([...r]),
    setFrozenRows: () => {},
    getLastRow: () => rows.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => rows.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)),
      setValues: (vals) => vals.forEach((v, i) => v.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; })),
    }),
  };
}

function load(user = STUDENT) {
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

function record(over = {}, id = 'id-1') {
  const draft = {
    ...emptyDraft({}, '2026-11-04'),
    klass: '3組', number: 12, name: '岡山 太郎', theme: '情報の信頼性',
    category: 'II', item: 'II-3', level: 3, icReflection: 'iCの振り返り', lessonReflection: '授業の振り返り',
    ...over,
  };
  return buildRecord(draft, { id, now: 0 });
}

test('Google側：振り返りを 1 行で保存し、先生がシートでも読める', () => {
  const g = load();
  const r = record();
  eq(g.submitReflection(JSON.stringify(r)), { ok: true });
  const rows = g.sheets['振り返り'].rows;
  eq(rows[0], ['受信日時', '日付', '組', '出席番号', '氏名', '授業テーマ', 'iCの大分類', 'iCの力', '自己評価',
    'iCの振り返り', '授業の振り返り', '送信者', '記録ID', '記録']);
  eq(rows[1].slice(1, 13), [`'2026-11-04`, `'3組`, 12, `'岡山 太郎`, `'情報の信頼性`, `'Ⅱ 論理的思考力`,
    `'Ⅱ-3 根拠提示力`, `'3 おおむね身についている`, `'iCの振り返り`, `'授業の振り返り`, `'${STUDENT}`, `'id-1`]);
  eq(JSON.parse(rows[1][13]).id, 'id-1');
});

test('Google側：同じ記録がもう一度届いたら上書きする', () => {
  const g = load();
  g.submitReflection(JSON.stringify(record()));
  g.submitReflection(JSON.stringify(record({ theme: '変更後' })));
  eq(g.sheets['振り返り'].rows.length, 2);
  eq(g.sheets['振り返り'].rows[1][5], `'変更後`);
});

test('Google側：形式の違うもの・欠けたもの・長すぎるものは受け取らない', () => {
  const g = load();
  eq(g.submitReflection('{').ok, false);
  eq(g.submitReflection(JSON.stringify({ ...record(), app: 'other' })).ok, false);
  eq(g.submitReflection(JSON.stringify({ ...record(), name: '' })).ok, false);
  eq(g.submitReflection(JSON.stringify({ ...record(), number: 0 })).ok, false);
  eq(g.submitReflection(JSON.stringify({ ...record(), date: '11/4' })).ok, false);
  eq(g.submitReflection(JSON.stringify({ ...record(), ic: { ...record().ic, level: 6 } })).ok, false);
  eq(g.submitReflection(JSON.stringify({ ...record(), lessonReflection: 'あ'.repeat(2001) })).ok, false);
  eq(g.sheets['振り返り'], undefined);
});

test('Google側：数式のような氏名もただの文字として保存する', () => {
  const g = load();
  g.submitReflection(JSON.stringify(record({ name: '=1+1' })));
  eq(g.sheets['振り返り'].rows[1][4], `'=1+1`);
});

test('Google側：先生かどうかを判定し、生徒には読み出させない', () => {
  eq(load(TEACHER).isTeacher(), true);
  eq(load(STUDENT).isTeacher(), false);
  eq(load('').isTeacher(), false);
  const g = load(STUDENT);
  for (const call of [() => g.listDates(), () => g.getReflections('2026-11-04')]) {
    let error = '';
    try {
      call();
    } catch (err) {
      error = err.message;
    }
    eq(error, '先生のアカウントでのみ使えます');
  }
});

test('Google側：先生は日付の一覧とその日の振り返りを読み出せる', () => {
  const g = load();
  g.submitReflection(JSON.stringify(record({}, 'a')));
  g.submitReflection(JSON.stringify(record({ number: 3 }, 'b')));
  g.submitReflection(JSON.stringify(record({ date: '2026-11-05' }, 'c')));
  g.user = TEACHER;
  eq(JSON.parse(JSON.stringify(g.listDates())), [{ date: '2026-11-05', count: 1 }, { date: '2026-11-04', count: 2 }]);
  const got = JSON.parse(JSON.stringify(g.getReflections('2026-11-04')));
  eq(got.map((x) => JSON.parse(x.json).id), ['a', 'b']);
  eq(got[0].submitter, STUDENT);
  eq(typeof got[0].receivedAt, 'string');
});
