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

// google.script.run と同じ形のにせもの。handlers[name] が結果を返すか、例外で失敗を表す
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
  const remote = createRemote(fakeRunner({ isTeacher: () => true, getRecords: (d) => [d] }, calls));
  eq(await remote.isTeacher(), true);
  eq(await remote.getRecords('2026-11-03'), ['2026-11-03']);
  eq(calls, [['isTeacher'], ['getRecords', '2026-11-03']]);
});

test('送信できたものだけ送信待ちから消える', async () => {
  const store = createStore(fakeBackend());
  store.addOutbox({ id: 'a' });
  store.addOutbox({ id: 'b' });
  store.addOutbox({ id: 'c' });
  const remote = createRemote(fakeRunner({
    submitRecord: (text) => {
      const { id } = JSON.parse(text);
      if (id === 'b') throw new Error('通信できません');
      if (id === 'c') return { ok: false, error: '記録の形式が正しくありません' };
      return { ok: true };
    },
  }));
  const r = await flushOutbox(store, remote);
  eq(store.listOutbox().map((x) => x.id), ['b', 'c']);
  eq(r, { sent: 1, left: 2, error: '記録の形式が正しくありません' });
});

test('送信中にもう一度呼んでも二重には送らない', async () => {
  const store = createStore(fakeBackend());
  store.addOutbox({ id: 'a' });
  const calls = [];
  const remote = createRemote(fakeRunner({ submitRecord: () => ({ ok: true }) }, calls));
  await Promise.all([flushOutbox(store, remote), flushOutbox(store, remote)]);
  eq(calls.length, 1);
  eq(store.listOutbox(), []);
});

test('送信機能がなければ何も送らない', async () => {
  const store = createStore(fakeBackend());
  store.addOutbox({ id: 'a' });
  eq(await flushOutbox(store, null), { sent: 0, left: 1, error: null });
});
