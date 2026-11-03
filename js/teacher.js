import { h, setChildren } from './dom.js';
import { parseExport, groupStats, memberStats, compareRows, csvForGroups, formatSeconds, todayString } from './model.js';
import { createSvg, renderWeb } from './web.js';
import { readFileTexts, downloadText } from './storage.js';
import { memberTable } from './result.js';

const keyOf = (s) => s.id || `${s.group}|${s.startedAt}`;

export function renderTeacher(root, { remote = null, onHome }) {
  let received = []; // 先生のスプレッドシートに届いた記録（Apps Script 版のみ）
  let loaded = []; // ファイルから読み込んだ記録
  let errors = [];
  const all = () => [...received, ...loaded];
  const body = h('div', { class: 'teacher' });
  const input = h('input', { type: 'file', accept: '.json,application/json', multiple: true, onChange: (e) => load(e.target.files) });
  const drop = h('div', { class: 'drop' },
    h('p', {}, remote
      ? 'ファイルで提出された記録（.json）も、ここにドラッグするか、ボタンで選んで読み込めます。'
      : '提出された記録ファイル（.json）を、ここにドラッグするか、ボタンで選んでください。'),
    h('label', { class: 'button' }, 'ファイルを選ぶ', input));

  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); load(e.dataTransfer.files); });

  const inbox = remote ? receivedPanel() : null;
  root.append(h('header', { class: 'bar' }, h('button', { onClick: onHome }, '← ホーム'), h('h2', {}, '教師：班の比較')),
    ...[inbox?.el, drop, body].filter(Boolean));

  function receivedPanel() {
    const select = h('select', { onChange: () => fetchDay(select.value) });
    const status = h('span', { class: 'hint' });
    const el = h('div', { class: 'inbox' },
      h('label', {}, '届いた記録の日付', select),
      h('button', { class: 'primary', onClick: () => refresh() }, '更新'),
      status);

    async function fetchDay(date) {
      if (!date) return;
      status.textContent = '読み込んでいます…';
      try {
        const rows = await remote.getRecords(date);
        const bad = [];
        received = [];
        for (const row of rows) {
          const r = parseExport(row.json);
          if (r.ok) received.push(r.session);
          else bad.push(`${row.submitter}：${r.error}`);
        }
        loaded = loaded.filter((s) => !received.some((x) => keyOf(x) === keyOf(s)));
        status.textContent = `${date} に届いた記録：${received.length}件${bad.length ? `（読めないもの ${bad.length}件：${bad.join('、')}）` : ''}`;
      } catch (err) {
        status.textContent = `読み込めませんでした（${err?.message ?? '通信できません'}）`;
      }
      draw();
    }

    async function refresh() {
      status.textContent = '読み込んでいます…';
      let dates;
      try {
        dates = await remote.listDates();
      } catch (err) {
        status.textContent = `読み込めませんでした（${err?.message ?? '通信できません'}）`;
        return;
      }
      if (!dates.length) {
        select.replaceChildren(h('option', { value: '' }, 'まだ届いていません'));
        status.textContent = '';
        return;
      }
      const keep = select.value || (dates.some((d) => d.date === todayString()) ? todayString() : dates[0].date);
      select.replaceChildren(...dates.map((d) => h('option', { value: d.date, selected: d.date === keep }, `${d.date}（${d.count}件）`)));
      select.value = dates.some((d) => d.date === keep) ? keep : dates[0].date;
      await fetchDay(select.value);
    }

    refresh();
    return { el };
  }

  async function load(files) {
    for (const { name, text } of await readFileTexts(files)) {
      if (!name.toLowerCase().endsWith('.json')) {
        errors.push({ fileName: name, error: '記録ファイル（.json）ではないので読み飛ばしました' });
        continue;
      }
      const r = parseExport(text);
      if (!r.ok) {
        errors.push({ fileName: name, error: r.error });
        continue;
      }
      if (all().some((x) => keyOf(x) === keyOf(r.session))) {
        errors.push({ fileName: name, error: '同じ記録がすでに読み込まれています' });
        continue;
      }
      loaded.push(r.session);
    }
    input.value = '';
    draw();
  }

  function detail(session) {
    const svg = createSvg('web');
    renderWeb(svg, session, { markSilent: true });
    const dlg = h('dialog', { class: 'detail' },
      h('div', { class: 'row' }, h('h3', {}, `${session.group}　${session.topic}`), h('button', { onClick: () => { dlg.close(); dlg.remove(); } }, '閉じる')),
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

  function compareTable(sessions) {
    const { headers, rows } = compareRows(sessions);
    return h('div', { class: 'table-wrap' }, h('table', { class: 'stats' },
      h('thead', {}, h('tr', {}, ...headers.map((x) => h('th', {}, x)))),
      h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map((x) => h('td', {}, x)))))));
  }

  function draw() {
    const sessions = all();
    setChildren(body,
      errors.length
        ? h('div', { class: 'errors' }, h('p', {}, '読み込めなかったファイル：'), h('ul', {}, ...errors.map((e) => h('li', {}, `${e.fileName}：${e.error}`))))
        : null,
      sessions.length
        ? h('div', { class: 'row' },
          h('button', { class: 'primary', onClick: () => downloadText(`班の比較_${todayString()}.csv`, csvForGroups(sessions), 'text/csv') }, '比較表を CSV で保存'),
          loaded.length || errors.length ? h('button', { onClick: () => { loaded = []; errors = []; draw(); } }, 'ファイルから読み込んだ分を閉じる') : null)
        : null,
      sessions.length ? compareTable(sessions) : null,
      h('div', { class: 'cards' }, ...sessions.map(card)));
  }

  draw();
}
