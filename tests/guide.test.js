import { test, eq } from './harness.js';
import { createSession, DEFAULT_TYPES, start, pause, addTurn, setTurnType } from '../js/model.js';
import { recordSteps } from '../js/guide.js';

function mk() {
  const members = [{ id: 'm1', name: '1', x: 0.3, y: 0.5 }, { id: 'm2', name: '2', x: 0.7, y: 0.5 }];
  return createSession({ group: '1班', topic: '', date: '2026-11-04', layout: 'free', members, types: DEFAULT_TYPES });
}

const states = (s) => recordSteps(s).map((x) => x.state);

test('手順バー：開始前は「開始」が今の手順', () => {
  eq(states(mk()), ['now', 'next', 'next', 'next']);
});

test('手順バー：開始したら「席をタップ」が今の手順', () => {
  eq(states(start(mk(), 0)), ['done', 'now', 'next', 'next']);
});

test('手順バー：タップしたら「種類を選ぶ」と次のタップがどちらも今の手順', () => {
  const s = start(mk(), 0);
  addTurn(s, 'm1', 0);
  eq(states(s), ['done', 'now', 'now', 'next']);
});

test('手順バー：種類を選んだら「種類」は済み', () => {
  const s = start(mk(), 0);
  addTurn(s, 'm1', 0);
  setTurnType(s, 't1');
  eq(states(s), ['done', 'now', 'done', 'next']);
});

test('手順バー：一時停止中は「再開」を案内する', () => {
  const s = pause(start(mk(), 0), 1000);
  const steps = recordSteps(s);
  eq(steps[0].state, 'now');
  eq(steps[0].text, '「再開」を押す');
});
