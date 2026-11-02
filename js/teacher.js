import { h, setChildren } from './dom.js';
import { parseExport, groupStats, memberStats, compareRows, csvForGroups, formatSeconds, todayString } from './model.js';
import { createSvg, renderWeb } from './web.js';
import { readFileTexts, downloadText } from './storage.js';
import { memberTable } from './result.js';

export function renderTeacher(root, { onHome }) {
  let sessions = [];
  let errors = [];
  const body = h('div', { class: 'teacher' });
  const input = h('input', { type: 'file', accept: '.json,application/json', multiple: true, onChange: (e) => load(e.target.files) });
  const drop = h('div', { class: 'drop' },
    h('p', {}, '提出された記録ファイル（.json）を、ここにドラッグするか、ボタンで選んでください。'),
    h('label', { class: 'button' }, 'ファイルを選ぶ', input));

  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); load(e.dataTransfer.files); });

  root.append(h('header', { class: 'bar' }, h('button', { onClick: onHome }, '← ホーム'), h('h2', {}, '教師：班の比較')), drop, body);

  async function load(files) {
    for (const { name, text } of await readFileTexts(files)) {
      const r = parseExport(text);
      if (!r.ok) {
        errors.push({ fileName: name, error: r.error });
        continue;
      }
      const key = `${r.session.group}|${r.session.startedAt}`;
      if (sessions.some((x) => `${x.group}|${x.startedAt}` === key)) {
        errors.push({ fileName: name, error: '同じ記録がすでに読み込まれています' });
        continue;
      }
      sessions.push(r.session);
    }
    input.value = '';
    draw();
  }

  function detail(session) {
    const svg = createSvg('web');
    renderWeb(svg, session, { markSilent: true });
    const dlg = h('dialog', { class: 'detail' },
      h('div', { class: 'row' }, h('h3', {}, `${session.group}　${session.topic}`), h('button', { onClick: () => dlg.close() }, '閉じる')),
      svg,
      memberTable(session, memberStats(session, 0)));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  function card(session) {
    const svg = createSvg('web');
    renderWeb(svg, session, { markSilent: true });
    const g = groupStats(session, 0);
    return h('button', { class: 'card', onClick: () => detail(session) },
      h('strong', {}, `${session.group}　${session.topic}`),
      svg,
      h('span', { class: 'hint' }, `発言${g.totalTurns}回・${formatSeconds(g.totalSeconds)}・0回の人${g.silentCount}人`));
  }

  function compareTable() {
    const { headers, rows } = compareRows(sessions);
    return h('div', { class: 'table-wrap' }, h('table', { class: 'stats' },
      h('thead', {}, h('tr', {}, ...headers.map((x) => h('th', {}, x)))),
      h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((x) => h('td', {}, x)))))));
  }

  function draw() {
    setChildren(body,
      errors.length
        ? h('div', { class: 'errors' }, h('p', {}, '読み込めなかったファイル：'), h('ul', {}, ...errors.map((e) => h('li', {}, `${e.fileName}：${e.error}`))))
        : null,
      sessions.length
        ? h('div', { class: 'row' },
          h('button', { class: 'primary', onClick: () => downloadText(`班の比較_${todayString()}.csv`, csvForGroups(sessions), 'text/csv') }, '比較表を CSV で保存'),
          h('button', { onClick: () => { sessions = []; errors = []; draw(); } }, 'すべて閉じる'))
        : null,
      sessions.length ? compareTable() : null,
      h('div', { class: 'cards' }, ...sessions.map(card)));
  }

  draw();
}
