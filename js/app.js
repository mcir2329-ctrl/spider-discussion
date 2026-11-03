import { h } from './dom.js';
import { createStore } from './storage.js';
import { pause } from './model.js';
import { createRemote, flushOutbox } from './remote.js';
import { renderSetup } from './setup.js';
import { renderRecord } from './record.js';
import { renderResult } from './result.js';
import { renderTeacher } from './teacher.js';

const RESEND_MS = 30000;

const root = document.getElementById('app');
const store = createStore();
const remote = createRemote(); // Apps Script 版のときだけ。GitHub 版では null
const teacherCheck = remote ? remote.isTeacher().catch(() => false) : Promise.resolve(true);
let cleanup = null;

function mount(render) {
  if (cleanup) cleanup();
  root.replaceChildren();
  cleanup = render(root) || null;
  window.scrollTo(0, 0);
}

function goHome() {
  mount(renderHome);
}

function newRecordQuestion(pending) {
  if (pending.status !== 'ended') return `終わっていない記録（${pending.group}）は、新しい記録をはじめると消えます。続けますか？`;
  if (!remote) return `前回の記録（${pending.group}）は、新しい記録をはじめると消えます。「提出用に保存」は済んでいますか？`;
  const unsent = store.listOutbox().some((r) => r.id === pending.id);
  return unsent
    ? `前回の記録（${pending.group}）は、まだ先生に送れていません。送信待ちとして残り、通信がつながると自動で送ります。新しい記録をはじめますか？`
    : null;
}

function goSetup() {
  const pending = store.loadCurrent();
  const question = pending && newRecordQuestion(pending);
  if (question && !confirm(question)) return;
  mount((el) => renderSetup(el, {
    store,
    onStart: (session) => {
      store.saveCurrent(session);
      goRecord(session);
    },
    onCancel: goHome,
  }));
}

function goRecord(session) {
  mount((el) => renderRecord(el, session, { store, onEnd: () => goResult(session), onHome: goHome }));
}

function goResult(session) {
  mount((el) => renderResult(el, session, { store, remote, onBack: () => goRecord(session), onHome: goHome }));
}

function goTeacher() {
  mount((el) => renderTeacher(el, { remote, onHome: goHome }));
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
  const teacherButton = h('button', { class: 'big', hidden: true, onClick: goTeacher }, '教師として使う');
  teacherCheck.then((ok) => { teacherButton.hidden = !ok; });
  el.append(h('section', { class: 'home' },
    h('h1', {}, 'スパイダー討論'),
    pending ? pendingNotice(pending) : null,
    h('div', { class: 'home-buttons' },
      h('button', { class: 'big primary', onClick: goSetup }, '記録係として使う'),
      teacherButton)));
}

if (remote) {
  const resend = () => flushOutbox(store, remote);
  resend();
  setInterval(resend, RESEND_MS);
  window.addEventListener('online', resend);
} else if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('サービスワーカーを登録できませんでした', err));
}

goHome();
