import { h } from './dom.js';
import { reopen, memberStats, groupStats, toExport, fileBaseName, formatSeconds } from './model.js';
import { createSvg, renderWeb, svgToPngBlob } from './web.js';
import { downloadText, downloadBlob } from './storage.js';

export function memberTable(session, stats) {
  return h('table', { class: 'stats' },
    h('thead', {}, h('tr', {},
      h('th', {}, '名前'), h('th', {}, '回数'), h('th', {}, '時間'),
      ...session.types.map((t) => h('th', {}, h('span', { class: 'dot', style: `--c:${t.color}` }), t.label)))),
    h('tbody', {}, ...stats.map((m) => h('tr', { class: m.count === 0 ? 'silent' : null },
      h('td', {}, m.name), h('td', {}, m.count), h('td', {}, formatSeconds(m.seconds)),
      ...session.types.map((t) => h('td', {}, m.byType[t.id] || 0))))));
}

export function renderResult(root, session, { store, onBack, onHome }) {
  const svg = createSvg('web');
  renderWeb(svg, session, { markSilent: true, caption: `${session.group}　${session.topic}　${session.date}` });
  const g = groupStats(session, 0);
  const status = h('p', { class: 'hint' });

  async function saveFiles() {
    const base = fileBaseName(session);
    downloadText(`${base}.json`, JSON.stringify(toExport(session), null, 2), 'application/json');
    try {
      downloadBlob(`${base}.png`, await svgToPngBlob(svg));
      status.textContent = `「${base}.json」と「${base}.png」を保存しました。ダウンロードフォルダから Classroom に添付して提出してください。`;
    } catch (err) {
      status.textContent = `記録ファイルは保存しましたが、画像を作れませんでした（${err.message}）。`;
    }
  }

  root.append(
    h('header', { class: 'bar' }, h('button', { onClick: onHome }, '← ホーム'), h('h2', {}, `結果：${session.group}`)),
    h('div', { class: 'result' },
      h('div', { class: 'stage' }, svg),
      h('div', { class: 'side' },
        h('ul', { class: 'summary' },
          h('li', {}, `発言の総数：${g.totalTurns}回`),
          h('li', {}, `討論の時間：${formatSeconds(g.totalSeconds)}`),
          h('li', {}, `いちばん多い人：${g.maxCount}回／いちばん少ない人：${g.minCount}回`),
          h('li', { class: g.silentCount ? 'alert' : null }, `発言0回の人：${g.silentCount}人`)),
        memberTable(session, memberStats(session, 0)),
        h('div', { class: 'row' },
          h('button', { class: 'big primary', onClick: saveFiles }, '提出用に保存'),
          h('button', {
            onClick: () => {
              reopen(session);
              store.saveCurrent(session);
              onBack();
            },
          }, '記録に戻る')),
        status)));
}
