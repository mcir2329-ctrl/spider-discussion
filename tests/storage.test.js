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

test('送信待ちは記録番号ごとに 1 件で、送れたものを消せる', () => {
  const store = createStore(fakeBackend());
  eq(store.listOutbox(), []);
  store.addOutbox({ id: 'a', v: 1 });
  store.addOutbox({ id: 'b', v: 1 });
  store.addOutbox({ id: 'a', v: 2 });
  eq(store.listOutbox(), [{ id: 'b', v: 1 }, { id: 'a', v: 2 }]);
  store.removeOutbox('b');
  eq(store.listOutbox(), [{ id: 'a', v: 2 }]);
});

test('使い方ガイドを見たかどうかを画面ごとに覚える', () => {
  const store = createStore(fakeBackend());
  eq(store.hasSeenGuide('record'), false);
  store.markGuideSeen('record');
  eq(store.hasSeenGuide('record'), true);
  eq(store.hasSeenGuide('setup'), false);
});

test('端末の保存が使えないときは、ガイドを見ていないものとして扱う', () => {
  const store = createStore(null);
  store.markGuideSeen('record');
  eq(store.hasSeenGuide('record'), false);
});

test(`準備の設定は最大 ${MAX_SETUPS} 件で、古いものから消える`, () => {
  const store = createStore(fakeBackend());
  for (let i = 0; i < 12; i++) store.saveSetup({ group: `g${i}` });
  const list = store.listSetups();
  eq(list.length, 10);
  eq(list[0].group, 'g11');
  eq(list[9].group, 'g2');
});
