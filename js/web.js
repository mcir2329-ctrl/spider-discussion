import { edges, lastEdge } from './model.js';

const NS = 'http://www.w3.org/2000/svg';
export const VIEW_W = 1000;
export const VIEW_H = 625;
const SEAT_R = 44;
const MAX_DOTS = 20;
const FONT = 'system-ui, "Noto Sans JP", sans-serif';

function el(tag, attrs = {}, text = null) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== null) node.textContent = text;
  return node;
}

const pos = (m) => ({ x: m.x * VIEW_W, y: m.y * VIEW_H });

export function createSvg(...classes) {
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add(...classes);
  return svg;
}

export function renderWeb(svg, session, { onSeatDown = null, highlightLast = false, markSilent = false, showCounts = true, caption = '' } = {}) {
  svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
  svg.replaceChildren(el('rect', { x: 0, y: 0, width: VIEW_W, height: VIEW_H, fill: '#ffffff' }));
  if (caption) svg.append(el('text', { x: 16, y: 32, 'font-size': 22, fill: '#333333', 'font-family': FONT }, caption));

  const byId = new Map(session.members.map((m) => [m.id, m]));
  const colorOf = new Map(session.types.map((t) => [t.id, t.color]));

  for (const e of edges(session.turns)) {
    const a = pos(byId.get(e.a));
    const b = pos(byId.get(e.b));
    svg.append(el('line', {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: '#9aa3ad', 'stroke-width': Math.min(2 + e.count * 2, 16), 'stroke-linecap': 'round',
    }));
  }

  const last = highlightLast ? lastEdge(session.turns) : null;
  if (last) {
    const a = pos(byId.get(last.from));
    const b = pos(byId.get(last.to));
    svg.append(el('line', {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      stroke: colorOf.get(last.type) ?? '#1d3557', 'stroke-width': 6, 'stroke-linecap': 'round',
    }));
  }

  const current = highlightLast ? session.turns.at(-1)?.member : null;
  for (const m of session.members) {
    const p = pos(m);
    const mine = session.turns.filter((t) => t.member === m.id);
    const silent = markSilent && mine.length === 0;
    const g = el('g', { class: 'seat', 'data-id': m.id });
    g.append(el('circle', {
      cx: p.x, cy: p.y, r: SEAT_R,
      fill: m.id === current ? '#ffe8a3' : '#f1f4f8',
      stroke: silent ? '#d64545' : '#1d3557',
      'stroke-width': silent ? 4 : 2,
      'stroke-dasharray': silent ? '8 6' : 'none',
    }));
    const name = m.name.length > 7 ? m.name.slice(0, 7) : m.name;
    const size = name.length <= 3 ? 22 : name.length <= 5 ? 17 : 14;
    g.append(el('text', {
      x: p.x, y: showCounts ? p.y + 2 : p.y + size / 3, 'text-anchor': 'middle',
      'font-size': size, 'font-weight': 700, fill: '#1d2733', 'font-family': FONT,
    }, name));
    if (showCounts) {
      g.append(el('text', {
        x: p.x, y: p.y + 24, 'text-anchor': 'middle', 'font-size': 14,
        fill: silent ? '#d64545' : '#5b6673', 'font-family': FONT,
      }, `${mine.length}回`));
    }
    mine.filter((t) => t.type && colorOf.has(t.type)).slice(0, MAX_DOTS).forEach((t, i) => {
      const a = ((-90 + i * 18) * Math.PI) / 180;
      g.append(el('circle', {
        cx: p.x + (SEAT_R + 10) * Math.cos(a), cy: p.y + (SEAT_R + 10) * Math.sin(a), r: 5, fill: colorOf.get(t.type),
      }));
    });
    if (onSeatDown) g.addEventListener('pointerdown', (ev) => onSeatDown(m.id, ev));
    svg.append(g);
  }
}

export function svgToPngBlob(svg, scale = 2) {
  const copy = svg.cloneNode(true);
  copy.setAttribute('xmlns', NS);
  copy.setAttribute('width', VIEW_W);
  copy.setAttribute('height', VIEW_H);
  const xml = new XMLSerializer().serializeToString(copy);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = VIEW_W * scale;
      canvas.height = VIEW_H * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を作れませんでした'))), 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を作れませんでした'));
    };
    img.src = url;
  });
}
