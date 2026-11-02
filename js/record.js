import { h, setChildren } from './dom.js';
import { start, pause, resume, addTurn, setTurnType, undo, end, elapsed, formatSeconds } from './model.js';
import { createSvg, renderWeb } from './web.js';

export function renderRecord(root, session, { store, onEnd, onHome }) {
  const svg = createSvg('web', 'live');
  const timer = h('span', { class: 'timer' });
  const typeBar = h('div', { class: 'type-bar' });
  const controls = h('div', { class: 'controls' });
  const warn = h('p', { class: 'warn', hidden: true }, 'この端末に保存できませんでした。終了後、すぐに「提出用に保存」をしてください。');
  const nameOf = (id) => session.members.find((m) => m.id === id)?.name ?? '';

  root.append(
    h('header', { class: 'bar' },
      h('button', { onClick: () => { act(() => pause(session, Date.now())); onHome(); } }, '← ホーム'),
      h('h2', {}, `${session.group}　${session.topic}`),
      timer),
    warn,
    h('div', { class: 'stage' }, svg),
    typeBar,
    controls);

  function save() {
    session.savedAt = Date.now();
    warn.hidden = store.saveCurrent(session);
  }

  function act(fn) {
    fn();
    save();
    draw();
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
    renderWeb(svg, session, { highlightLast: true, onSeatDown: (id) => act(() => addTurn(session, id, Date.now())) });
    svg.classList.toggle('disabled', session.status !== 'running');
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

  const timerId = setInterval(tick, 500);
  const saveId = setInterval(save, 5000);
  window.addEventListener('pagehide', save);
  draw();

  return () => {
    clearInterval(timerId);
    clearInterval(saveId);
    window.removeEventListener('pagehide', save);
  };
}
