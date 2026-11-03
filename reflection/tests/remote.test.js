import { test, eq } from './harness.js';
import { createStore } from '../js/storage.js';
import { createRemote, flushOutbox } from '../js/remote.js';

function fakeBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// google.script.run と同じ形のにせもの
function fakeRunner(handlers, calls = []) {
  const make = (ok = () => {}, ng = () => {}) => new Proxy({}, {
    get(_, prop) {
      if (prop === 'withSuccessHandler') return (f) => make(f, ng);
      if (prop === 'withFailureHandler') return (f) => make(ok, f);
      return (...args) => {
        calls.push([prop, ...args]);
        Promise.resolve().then(() => {
          try {
            ok(handlers[prop](...args));
          } catch (err) {
            ng(err);
          }
        });
      };
    },
  });
  return make();
}

test('Google の仕組みがなければ送信機能なしになる', () => {
  eq(createRemote(undefined), null);
});

test('google.script.run を Promise で呼べる', async () => {
  const calls = [];
  const remote = createRemote(fakeRunner({ isTeacher: () => true, getReflections: (d) => [d] }, calls));
  eq(await remote.isTeacher(), true);
  eq(await remote.getReflections('2026-11-04'), ['2026-11-04']);
  eq(calls, [['isTeacher'], ['getReflections', '2026-11-04']]);
});

test('送信できたものだけ送信待ちから消え、理由がわかる', async () => {
  const store = createStore(fakeBackend());
  for (const id of ['a', 'b', 'c']) store.addOutbox({ id });
  const remote = createRemote(fakeRunner({
    submitReflection: (text) => {
      const { id } = JSON.parse(text);
      if (id === 'b') throw new Error('NetworkError');
      if (id === 'c') return { ok: false, error: '記録の形式が正しくありません' };
      return { ok: true };
    },
  }));
  eq(await flushOutbox(store, remote), { sent: 1, left: 2, error: '記録の形式が正しくありません' });
  eq(store.listOutbox().map((x) => x.id), ['b', 'c']);
});

test('通信の失敗はわかりやすい言葉で返す', async () => {
  const store = createStore(fakeBackend());
  store.addOutbox({ id: 'a' });
  const remote = createRemote(fakeRunner({ submitReflection: () => { throw new Error('NetworkError: HTTP 0'); } }));
  eq((await flushOutbox(store, remote)).error, '通信できませんでした');
});

test('送信中にもう一度呼んでも二重には送らない', async () => {
  const store = createStore(fakeBackend());
  store.addOutbox({ id: 'a' });
  const calls = [];
  const remote = createRemote(fakeRunner({ submitReflection: () => ({ ok: true }) }, calls));
  await Promise.all([flushOutbox(store, remote), flushOutbox(store, remote)]);
  eq(calls.length, 1);
  eq(store.listOutbox(), []);
});
