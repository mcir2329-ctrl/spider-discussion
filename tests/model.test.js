import { test, eq } from './harness.js';
import {
  formatSeconds, todayString, DEFAULT_TYPES, layoutPositions, createSession,
  elapsed, start, pause, resume, addTurn, setTurnType, undo, end, reopen,
  edges, lastEdge, memberStats, groupStats, typeShares,
  toExport, parseExport, fileBaseName, compareRows, csvForGroups,
} from '../js/model.js';

test('formatSeconds は 分:秒 にする', () => {
  eq(formatSeconds(0), '0:00');
  eq(formatSeconds(65.4), '1:05');
  eq(formatSeconds(600), '10:00');
});

test('formatSeconds は比較表の秒数と合うよう四捨五入する', () => {
  eq(formatSeconds(18.6), '0:19');
  eq(formatSeconds(59.6), '1:00');
});

test('todayString は端末の日付を YYYY-MM-DD にする', () => {
  eq(todayString(new Date(2026, 10, 3, 9, 5)), '2026-11-03');
});

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
