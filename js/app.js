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

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('サービスワーカーを登録できませんでした', err));
}

goHome();
