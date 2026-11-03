import { h } from './dom.js';
import { reopen, memberStats, groupStats, toExport, fileBaseName, formatSeconds, ensureId } from './model.js';
import { createSvg, renderWeb, svgToPngBlob } from './web.js';
import { downloadText, downloadBlob } from './storage.js';
import { flushOutbox } from './remote.js';
import { guideButton, showGuideOnce } from './guide.js';

const STATUS_CHECK_MS = 5000;

export function memberTable(session, stats) {
  return h('table', { class: 'stats' },
    h('thead', {}, h('tr', {},
      h('th', {}, '名前'), h('th', {}, '回数'), h('th', {}, '時間'),
      ...session.types.map((t) => h('th', {}, h('span', { class: 'dot', style: `--c:${t.color}` }), t.label)))),
    h('tbody', {}, ...stats.map((m) => h('tr', { class: m.count === 0 ? 'silent' : null },
      h('td', {}, m.name), h('td', {}, m.count), h('td', {}, formatSeconds(m.seconds)),
      ...session.types.map((t) => h('td', {}, m.byType[t.id] || 0))))));
}

export function renderResult(root, session, { store, remote = null, onBack, onHome }) {
  const svg = createSvg('web');
  renderWeb(svg, session, { markSilent: true, caption: `${session.group}　${session.topic}　${session.date}` });
  const g = groupStats(session, 0);
  const status = h('p', { class: 'hint' });
  const sendStatus = h('p', { class: 'send-status' });
  const resendButton = h('button', { hidden: true, onClick: () => send() }, 'もう一度送る');

  async function saveFiles() {
    const base = fileBaseName(session);
    downloadText(`${base}.json`, JSON.stringify(toExport(session), null, 2), 'application/json');
    try {
      downloadBlob(`${base}.png`, await svgToPngBlob(svg));
      status.textContent = remote
        ? `「${base}.json」と「${base}.png」を保存しました（予備の控えです）。`
        : `「${base}.json」と「${base}.png」を保存しました。ダウンロードフォルダから Classroom に添付して提出してください。`;
    } catch (err) {
      status.textContent = `記録ファイルは保存しましたが、画像を作れませんでした（${err.message}）。`;
    }
  }

  const isUnsent = () => store.listOutbox().some((r) => r.id === session.id);

  function showSendStatus(error = null) {
    const unsent = isUnsent();
    sendStatus.className = unsent ? 'send-status pending' : 'send-status done';
    sendStatus.textContent = unsent
      ? `送信待ち：通信がつながると自動で先生に送ります。${error ? `（${error}）` : ''}`
      : '✓ 先生に送りました';
    resendButton.hidden = !unsent;
  }

  async function send() {
    sendStatus.className = 'send-status pending';
    sendStatus.textContent = '先生に送っています…';
    const r = await flushOutbox(store, remote);
    showSendStatus(r.error);
  }

  let checkId = null;
  if (remote) {
    // 番号のない古い記録にも番号を付けてから送信待ちに入れる。同じ番号なら Google 側で上書きされる
    ensureId(session);
    store.saveCurrent(session);
    store.addOutbox(toExport(session));
    send();
    checkId = setInterval(() => showSendStatus(), STATUS_CHECK_MS);
  }

  root.append(
    h('header', { class: 'bar' }, h('button', { onClick: onHome }, '← ホーム'), h('h2', {}, `結果：${session.group}`),
      guideButton('result', { remote: !!remote })),
    h('div', { class: 'result' },
      h('div', { class: 'stage' }, svg),
      h('div', { class: 'side' },
        h('ul', { class: 'summary' },
          h('li', {}, `発言の総数：${g.totalTurns}回`),
          h('li', {}, `討論の時間：${formatSeconds(g.totalSeconds)}`),
          h('li', {}, `いちばん多い人：${g.maxCount}回／いちばん少ない人：${g.minCount}回`),
          h('li', { class: g.silentCount ? 'alert' : null }, `発言0回の人：${g.silentCount}人`)),
        memberTable(session, memberStats(session, 0)),
        remote ? h('div', { class: 'row' }, sendStatus, resendButton) : null,
        h('div', { class: 'row' },
          h('button', { class: remote ? 'big' : 'big primary', onClick: saveFiles }, remote ? 'ファイルにも保存' : '提出用に保存'),
          h('button', {
            onClick: () => {
              reopen(session);
              store.saveCurrent(session);
              onBack();
            },
          }, '記録に戻る')),
        status)));

  showGuideOnce('result', store, { remote: !!remote });
  return () => clearInterval(checkId);
}
