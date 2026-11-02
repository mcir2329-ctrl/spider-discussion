import { h, setChildren } from './dom.js';
import { start, pause, resume, addTurn, setTurnType, undo, end, elapsed, formatSeconds } from './model.js';
import { createSvg, renderWeb } from './web.js';

const DOUBLE_TAP_MS = 600; // 同じ席をこれより短い間隔で続けて押したときは押し間違いとみなす
const SLEEP_GAP_MS = 90000; // タイマーがこれ以上止まっていたら、ふたを閉じるなどで端末が休止していたとみなす

export function renderRecord(root, session, { store, onEnd, onHome }) {
  const svg = createSvg('web', 'live');
  const timer = h('span', { class: 'timer' });
  const typeBar = h('div', { class: 'type-bar' });
  const controls = h('div', { class: 'controls' });
  const warn = h('p', { class: 'warn', hidden: true }, 'この端末に保存できませんでした。終了後、すぐに「提出用に保存」をしてください。');
  const sleepNote = h('p', { class: 'warn', hidden: true }, '画面がしばらく止まっていたので、その間の時間は数えずに一時停止しました。討論が続いていれば「再開」を押してください。');
  const nameOf = (id) => session.members.find((m) => m.id === id)?.name ?? '';
  let lastTap = { id: null, at: 0 };
  let lastTick = Date.now();

  svg.addEventListener('contextmenu', (e) => e.preventDefault());

  root.append(
    h('header', { class: 'bar' },
      h('button', { onClick: () => { act(() => pause(session, Date.now())); onHome(); } }, '← ホーム'),
      h('h2', {}, `${session.group}　${session.topic}`),
      timer),
    warn,
    sleepNote,
    h('div', { class: 'stage' }, svg),
    typeBar,
    controls);

  function save() {
    session.savedAt = Date.now();
    warn.hidden = store.saveCurrent(session);
  }

  function act(fn) {
    lastTick = Date.now(); // 操作があった時点では端末は動いている。休止の判定をここから数え直す
    fn();
    save();
    draw();
  }

  function tapSeat(id, ev) {
    if (ev.button !== 0) return;
    const now = Date.now();
    const repeated = id === lastTap.id && now - lastTap.at < DOUBLE_TAP_MS;
    lastTap = { id, at: now };
    if (!repeated) act(() => addTurn(session, id, now));
  }

  function checkSleep() {
    const now = Date.now();
    const gap = now - lastTick;
    lastTick = now;
    if (session.status !== 'running' || gap < SLEEP_GAP_MS) return;
    act(() => pause(session, now - gap));
    sleepNote.hidden = false;
  }

  function tick() {
    timer.textContent = (session.status === 'paused' ? '一時停止中 ' : '') + formatSeconds(elapsed(session, Date.now()));
  }

  function drawTypeBar() {
    const last = session.turns[session.turns.length - 1];
    if (!last) {
      typeBar.replaceChildren(h('span', { class: 'hint' },
        session.status === 'ready' ? '「開始」を押してから、話した人の席をタップします。' : '話した人の席をタップします。'));
      return;
    }
    typeBar.replaceChildren(
      h('span', { class: 'hint' }, `${nameOf(last.member)} の発言：`),
      ...session.types.map((t) => h('button', {
        class: last.type === t.id ? 'type on' : 'type',
        style: `--c:${t.color}`,
        onClick: () => act(() => setTurnType(session, t.id)),
      }, t.label)));
  }

  function draw() {
    renderWeb(svg, session, { highlightLast: true, onSeatDown: tapSeat });
    svg.classList.toggle('disabled', session.status !== 'running');
    if (session.status === 'running') sleepNote.hidden = true;
    drawTypeBar();
    const { status } = session;
    setChildren(controls,
      status === 'ready' ? h('button', { class: 'big primary', onClick: () => act(() => start(session, Date.now())) }, '開始') : null,
      status === 'running' ? h('button', { class: 'big', onClick: () => act(() => pause(session, Date.now())) }, '一時停止') : null,
      status === 'paused' ? h('button', { class: 'big primary', onClick: () => act(() => resume(session, Date.now())) }, '再開') : null,
      h('button', { class: 'big', disabled: status === 'ready' || !session.turns.length, onClick: () => act(() => undo(session)) }, '取り消し'),
      h('button', {
        class: 'big danger',
        disabled: status === 'ready',
        onClick: () => {
          if (!confirm('討論の記録を終了しますか？')) return;
          act(() => end(session, Date.now()));
          onEnd();
        },
      }, '終了'));
    tick();
  }

  const timerId = setInterval(() => {
    checkSleep();
    tick();
  }, 500);
  const saveId = setInterval(save, 5000);
  window.addEventListener('pagehide', save);
  draw();

  return () => {
    clearInterval(timerId);
    clearInterval(saveId);
    window.removeEventListener('pagehide', save);
  };
}
