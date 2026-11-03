import { test, eq } from './harness.js';
import { createStore } from '../js/storage.js';

function fakeBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('書きかけの振り返りを保存して読み込め、消せる', () => {
  const store = createStore(fakeBackend());
  eq(store.loadDraft(), null);
  eq(store.saveDraft({ theme: 'A' }), true);
  eq(store.loadDraft(), { theme: 'A' });
  store.clearDraft();
  eq(store.loadDraft(), null);
});

test('組・出席番号・氏名を覚えておける', () => {
  const store = createStore(fakeBackend());
  eq(store.loadProfile(), {});
  store.saveProfile({ klass: '1組', number: 3, name: 'A' });
  eq(store.loadProfile(), { klass: '1組', number: 3, name: 'A' });
});

test('送信待ちは記録ごとに 1 件で、送れたものを消せる', () => {
  const store = createStore(fakeBackend());
  store.addOutbox({ id: 'a', v: 1 });
  store.addOutbox({ id: 'b', v: 1 });
  store.addOutbox({ id: 'a', v: 2 });
  eq(store.listOutbox(), [{ id: 'b', v: 1 }, { id: 'a', v: 2 }]);
  store.removeOutbox('b');
  eq(store.listOutbox(), [{ id: 'a', v: 2 }]);
});

test('端末の保存が使えなくても止まらない', () => {
  const store = createStore(null);
  eq(store.saveDraft({ theme: 'A' }), false);
  eq(store.loadDraft(), null);
  eq(store.loadProfile(), {});
  eq(store.listOutbox(), []);
  store.clearDraft();
});

test('壊れたデータは読み込まない', () => {
  const backend = fakeBackend();
  backend.setItem('reflect.draft', '{');
  eq(createStore(backend).loadDraft(), null);
});
