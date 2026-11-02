import { h, setChildren } from './dom.js';
import { DEFAULT_TYPES, MIN_MEMBERS, MAX_MEMBERS, MAX_TYPES, layoutPositions, createSession, todayString } from './model.js';
import { createSvg, renderWeb } from './web.js';

const LAYOUTS = [['circle', '円形'], ['rect', '長方形'], ['free', '自由配置']];
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round3 = (v) => Math.round(v * 1000) / 1000;

function makeMembers(layout, count, old) {
  return layoutPositions(layout, count).map((p, i) => ({ id: `m${i + 1}`, name: old[i]?.name ?? String(i + 1), ...p }));
}

function blankSetup() {
  return { group: '', topic: '', layout: 'circle', members: makeMembers('circle', 6, []), types: DEFAULT_TYPES.map((t) => ({ ...t })) };
}

export function renderSetup(root, { store, onStart, onCancel }) {
  let setup = blankSetup();
  const saved = store.listSetups();
  const form = h('div', { class: 'setup' });
  const preview = createSvg('web', 'preview');
  const error = h('p', { class: 'error' });

  root.append(h('header', { class: 'bar' }, h('button', { onClick: onCancel }, '← もどる'), h('h2', {}, '準備')), form);

  function redrawPreview() {
    renderWeb(preview, { members: setup.members, types: setup.types, turns: [] }, { onSeatDown: startDrag, showCounts: false });
  }

  function startDrag(id, ev) {
    ev.preventDefault();
    const m = setup.members.find((x) => x.id === id);
    const move = (e) => {
      const r = preview.getBoundingClientRect();
      m.x = round3(clamp((e.clientX - r.left) / r.width, 0.06, 0.94));
      m.y = round3(clamp((e.clientY - r.top) / r.height, 0.08, 0.92));
      redrawPreview();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function field(label, key, placeholder) {
    return h('label', {}, label, h('input', { value: setup[key], placeholder, maxlength: 40, onInput: (e) => { setup[key] = e.target.value; } }));
  }

  const nextTypeId = () => {
    let n = 1;
    while (setup.types.some((t) => t.id === `t${n}`)) n++;
    return `t${n}`;
  };

  function typesEditor() {
    return h('div', { class: 'types' },
      ...setup.types.map((t, i) => h('div', { class: 'row type-row' },
        h('input', { type: 'color', value: t.color, onInput: (e) => { t.color = e.target.value; redrawPreview(); } }),
        h('input', { value: t.label, maxlength: 8, onInput: (e) => { t.label = e.target.value; } }),
        h('button', { onClick: () => { setup.types.splice(i, 1); draw(); } }, '削除'))),
      setup.types.length < MAX_TYPES
        ? h('button', { onClick: () => { setup.types.push({ id: nextTypeId(), label: '新しい種類', color: '#555555' }); draw(); } }, '＋ 種類を追加')
        : null);
  }

  function draw() {
    redrawPreview();
    setChildren(form,
      saved.length
        ? h('label', {}, '前回の設定を使う', h('select', {
          onChange: (e) => {
            const s = saved[e.target.value];
            if (!s) return;
            setup = structuredClone(s);
            draw();
          },
        }, h('option', { value: '' }, '選んでください'), ...saved.map((s, i) => h('option', { value: i }, `${s.group}（${s.topic || 'テーマなし'}）`))))
        : null,
      field('班の名前', 'group', '例：3班'),
      field('討論のテーマ', 'topic', ''),
      h('div', { class: 'row' },
        h('label', {}, '人数', h('select', {
          onChange: (e) => { setup.members = makeMembers(setup.layout, Number(e.target.value), setup.members); draw(); },
        }, ...range(MIN_MEMBERS, MAX_MEMBERS).map((n) => h('option', { value: n, selected: n === setup.members.length }, `${n}人`)))),
        h('label', {}, '座席の並び', h('select', {
          onChange: (e) => { setup.layout = e.target.value; setup.members = makeMembers(setup.layout, setup.members.length, setup.members); draw(); },
        }, ...LAYOUTS.map(([v, label]) => h('option', { value: v, selected: v === setup.layout }, label))))),
      h('p', { class: 'hint' }, '席をドラッグすると位置を動かせます。名前は出席番号でもかまいません（提出するファイルに名前を入れたくないときは出席番号にしてください）。'),
      preview,
      h('h3', {}, 'メンバー'),
      h('div', { class: 'names' }, ...setup.members.map((m, i) => h('label', {}, `席${i + 1}`,
        h('input', { value: m.name, maxlength: 12, onInput: (e) => { m.name = e.target.value; redrawPreview(); } })))),
      h('h3', {}, '発言の種類'),
      typesEditor(),
      error,
      h('div', { class: 'row end' }, h('button', { class: 'big primary', onClick: submit }, '記録をはじめる')));
  }

  function submit() {
    setup.group = setup.group.trim();
    setup.topic = setup.topic.trim();
    for (const m of setup.members) m.name = m.name.trim();
    if (!setup.group) {
      error.textContent = '班の名前を入れてください。';
      return;
    }
    if (setup.members.some((m) => !m.name)) {
      error.textContent = '名前が空の席があります。';
      return;
    }
    setup.types = setup.types.map((t) => ({ ...t, label: t.label.trim() })).filter((t) => t.label);
    store.saveSetup({ ...structuredClone(setup), savedAt: new Date().toISOString() });
    onStart(createSession({ ...setup, date: todayString() }));
  }

  draw();
}
