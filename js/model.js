export const APP_ID = 'spider-discussion';
export const FORMAT_VERSION = 1;

const pad2 = (n) => String(n).padStart(2, '0');

export function formatSeconds(sec) {
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}

export function todayString(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export const MIN_MEMBERS = 2;
export const MAX_MEMBERS = 12;
export const MAX_TYPES = 8;

export const DEFAULT_TYPES = [
  { id: 't1', label: '質問', color: '#2f6fdd' },
  { id: 't2', label: '根拠', color: '#1f9d55' },
  { id: 't3', label: '反論', color: '#d64545' },
  { id: 't4', label: 'つなぐ', color: '#d98a00' },
  { id: 't5', label: 'まとめ', color: '#8a4fd6' },
];

const round1 = (v) => Math.round(v * 10) / 10;
const round3 = (v) => Math.round(v * 1000) / 1000;

export function layoutPositions(layout, count) {
  if (layout === 'circle') {
    return Array.from({ length: count }, (_, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / count;
      return { x: round3(0.5 + 0.36 * Math.cos(a)), y: round3(0.5 + 0.38 * Math.sin(a)) };
    });
  }
  if (layout === 'rect') {
    const top = Math.ceil(count / 2);
    const row = (n, y) => Array.from({ length: n }, (_, i) => ({ x: round3(0.15 + (0.7 * (i + 0.5)) / n), y }));
    return [...row(top, 0.2), ...row(count - top, 0.8).reverse()];
  }
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => ({
    x: round3(0.1 + (0.8 * ((i % cols) + 0.5)) / cols),
    y: round3(0.1 + (0.8 * (Math.floor(i / cols) + 0.5)) / rows),
  }));
}

export function createSession({ group, topic, date, layout, members, types }) {
  return {
    app: APP_ID,
    version: FORMAT_VERSION,
    group,
    topic,
    date,
    layout,
    members: members.map((m) => ({ id: m.id, name: m.name, x: m.x, y: m.y })),
    types: types.map((t) => ({ id: t.id, label: t.label, color: t.color })),
    turns: [],
    startedAt: null,
    totalSeconds: 0,
    status: 'ready',
    elapsedBefore: 0,
    runningSince: null,
  };
}

export function elapsed(s, now) {
  const running = s.runningSince === null ? 0 : (now - s.runningSince) / 1000;
  return round1(s.elapsedBefore + running);
}

const lastTurn = (s) => s.turns[s.turns.length - 1];

export function turnDuration(s, turn, now) {
  return turn.duration ?? round1(elapsed(s, now) - turn.start);
}

export function start(s, now) {
  if (s.status !== 'ready') return s;
  s.status = 'running';
  s.runningSince = now;
  s.startedAt = new Date(now).toISOString();
  return s;
}

export function pause(s, now) {
  if (s.status !== 'running') return s;
  s.elapsedBefore = elapsed(s, now);
  s.runningSince = null;
  s.status = 'paused';
  return s;
}

export function resume(s, now) {
  if (s.status !== 'paused') return s;
  s.runningSince = now;
  s.status = 'running';
  return s;
}

export function addTurn(s, memberId, now) {
  if (s.status !== 'running') return s;
  const t = elapsed(s, now);
  const last = lastTurn(s);
  if (last) last.duration = round1(t - last.start);
  s.turns.push({ member: memberId, start: t, duration: null, type: null });
  return s;
}

export function setTurnType(s, typeId) {
  const last = lastTurn(s);
  if (!last || (s.status !== 'running' && s.status !== 'paused')) return s;
  last.type = last.type === typeId ? null : typeId;
  return s;
}

export function undo(s) {
  if (s.status !== 'running' && s.status !== 'paused') return s;
  s.turns.pop();
  const last = lastTurn(s);
  if (last) last.duration = null;
  return s;
}

export function end(s, now) {
  if (s.status !== 'running' && s.status !== 'paused') return s;
  s.elapsedBefore = elapsed(s, now);
  s.runningSince = null;
  s.totalSeconds = s.elapsedBefore;
  const last = lastTurn(s);
  if (last) last.duration = round1(s.totalSeconds - last.start);
  s.status = 'ended';
  return s;
}

export function reopen(s) {
  if (s.status !== 'ended') return s;
  const last = lastTurn(s);
  if (last) last.duration = null;
  s.status = 'paused';
  return s;
}

export function edges(turns) {
  const map = new Map();
  for (let i = 1; i < turns.length; i++) {
    const from = turns[i - 1].member;
    const to = turns[i].member;
    if (from === to) continue;
    const [a, b] = from < to ? [from, to] : [to, from];
    const key = `${a}|${b}`;
    const e = map.get(key) || { a, b, count: 0 };
    e.count++;
    map.set(key, e);
  }
  return [...map.values()];
}

export function lastEdge(turns) {
  if (turns.length < 2) return null;
  const prev = turns[turns.length - 2];
  const cur = turns[turns.length - 1];
  if (prev.member === cur.member) return null;
  return { from: prev.member, to: cur.member, type: cur.type };
}

export function memberStats(s, now) {
  return s.members.map((m) => {
    const mine = s.turns.filter((t) => t.member === m.id);
    const byType = {};
    for (const t of mine) if (t.type) byType[t.type] = (byType[t.type] || 0) + 1;
    const seconds = round1(mine.reduce((sum, t) => sum + turnDuration(s, t, now), 0));
    return { id: m.id, name: m.name, count: mine.length, seconds, byType };
  });
}

export function groupStats(s, now) {
  const counts = memberStats(s, now).map((m) => m.count);
  return {
    totalTurns: s.turns.length,
    totalSeconds: s.status === 'ended' ? s.totalSeconds : elapsed(s, now),
    silentCount: counts.filter((c) => c === 0).length,
    maxCount: Math.max(...counts),
    minCount: Math.min(...counts),
  };
}

export function typeShares(s) {
  const out = {};
  for (const t of s.types) {
    const n = s.turns.filter((x) => x.type === t.id).length;
    out[t.label] = (out[t.label] || 0) + (s.turns.length ? round3(n / s.turns.length) : 0);
  }
  return out;
}

const EXPORT_KEYS = ['app', 'version', 'group', 'topic', 'date', 'layout', 'members', 'types', 'turns', 'startedAt', 'totalSeconds'];
const BROKEN = '記録ファイルの中身が壊れています';

export function toExport(s) {
  const out = {};
  for (const k of EXPORT_KEYS) out[k] = s[k];
  return JSON.parse(JSON.stringify(out));
}

export function parseExport(text) {
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSONとして読めません' };
  }
  if (!d || d.app !== APP_ID) return { ok: false, error: 'このアプリの記録ファイルではありません' };
  if (d.version !== FORMAT_VERSION) return { ok: false, error: `対応していない形式です（version ${d.version}）` };
  if (!Array.isArray(d.members) || !Array.isArray(d.types) || !Array.isArray(d.turns)) return { ok: false, error: BROKEN };
  const ids = new Set(d.members.map((m) => m.id));
  const bad = d.turns.some((t) => !ids.has(t.member) || typeof t.start !== 'number' || typeof t.duration !== 'number');
  if (bad || typeof d.totalSeconds !== 'number') return { ok: false, error: BROKEN };
  return { ok: true, session: { ...d, status: 'ended', elapsedBefore: d.totalSeconds, runningSince: null } };
}

export function fileBaseName(s) {
  const group = (s.group || '班').replace(/[\\/:*?"<>|\s]+/g, '_');
  return `${group}_${s.date}`;
}

export function compareRows(sessions) {
  const labels = [];
  for (const s of sessions) for (const t of s.types) if (!labels.includes(t.label)) labels.push(t.label);
  const headers = ['班', 'テーマ', '人数', '発言の総数', '討論の時間（秒）', '発言0回の人数', ...labels.map((l) => `${l}（%）`)];
  const rows = sessions.map((s) => {
    const g = groupStats(s, 0);
    const shares = typeShares(s);
    return [s.group, s.topic, s.members.length, g.totalTurns, Math.round(g.totalSeconds), g.silentCount,
      ...labels.map((l) => Math.round((shares[l] || 0) * 100))];
  });
  return { headers, rows };
}

const csvCell = (v) => {
  const text = String(v);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function csvForGroups(sessions) {
  const { headers, rows } = compareRows(sessions);
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
