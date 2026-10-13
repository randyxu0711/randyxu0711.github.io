import { clamp, lerp } from 'scene3d/anim.js';

export const CARD = { W: 127, H: 76, T: 0.6 };
export const DESK = { MIN: 4, MAX: 12, DAYS: 7, COLS: 4, PITCH_X: 150, PITCH_Z: 105, FRONT: 240 };
export const PILES = { MAX: 12, COLS: 4, PITCH_X: 150, PITCH_Z: 150, BACK: -90, LABEL: 56 };
export const DRAWER = { W: 150, H: 75, GAP: 6, D: 8 };
export const CAB = { Z: -480, DEPTH: 240, SIDE: 10, BASE: 24, TOP: 12 };
export const SPLIT = 60;
export const FOV = 35;
const DAY = 86400000;

export function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

export function mainName(host) {
  const p = String(host).split('.');
  return p[Math.max(0, p.length - 2)] || String(host);
}

export const hueOf = (s) => hash(s) % 360;

export const tabSlot = (tag) => hash(tag) % 5;

export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const jitter = (r, s) => (r() * 2 - 1) * s;

export function taipeiToday(ms) {
  return new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
}

const dayNum = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY;

const fromDayNum = (n) => new Date(n * DAY).toISOString().slice(0, 10);

export function weekStart(d) {
  const n = dayNum(d);
  return fromDayNum(n - ((new Date(n * DAY).getUTCDay() + 6) % 7));
}

export function pickDesk(items, today) {
  const from = dayNum(today) - (DESK.DAYS - 1);
  let recent = 0;
  while (recent < items.length && dayNum(items[recent].d) >= from) recent++;
  const n = Math.min(DESK.MAX, Math.max(Math.min(DESK.MIN, items.length), recent));
  const desk = items.slice(0, n).map((_, i) => i);
  const piles = [];
  for (let i = n; i < items.length; i++) {
    const week = weekStart(items[i].d);
    let p = piles[piles.length - 1];
    if (!p || p.week !== week) {
      if (piles.length === PILES.MAX) break;
      p = { week, ids: [] };
      piles.push(p);
    }
    p.ids.push(i);
  }
  return { desk, piles };
}

export function groups(items, mode) {
  const map = new Map();
  const add = (key, i) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(i);
  };
  items.forEach((it, i) => {
    if (mode === 'source') add(it.s, i);
    else if (mode === 'month') add(it.d.slice(0, 7), i);
    else if (it.g.length) it.g.forEach((g) => add(g, i));
    else add('', i);
  });
  let list = [...map].map(([key, ids]) => ({ key, kind: mode === 'tag' && key === '' ? 'untagged' : mode, ids }));
  if (mode === 'source') {
    const other = list.filter((d) => d.ids.length < 2).flatMap((d) => d.ids).sort((a, b) => a - b);
    list = list.filter((d) => d.ids.length >= 2);
    if (other.length) list.push({ key: '', kind: 'other', ids: other });
  }
  const last = (d) => (d.kind === 'other' || d.kind === 'untagged' ? 1 : 0);
  if (mode === 'month') list.sort((a, b) => (a.key < b.key ? 1 : -1));
  else list.sort((a, b) => last(a) - last(b) || b.ids.length - a.ids.length || a.key.localeCompare(b.key));
  return list.flatMap((d) => {
    if (d.ids.length <= SPLIT) return [{ ...d, part: 0, parts: 1 }];
    const parts = Math.ceil(d.ids.length / SPLIT);
    return Array.from({ length: parts }, (_, k) => ({ ...d, ids: d.ids.slice(k * SPLIT, (k + 1) * SPLIT), part: k + 1, parts }));
  });
}

export function cabinet(n) {
  const cols = n > 16 ? 5 : Math.max(1, Math.min(4, n));
  const rows = Math.max(1, Math.ceil(n / cols));
  const width = cols * DRAWER.W + (cols + 1) * DRAWER.GAP + 2 * CAB.SIDE;
  const height = CAB.BASE + rows * DRAWER.H + (rows + 1) * DRAWER.GAP + CAB.TOP;
  const slots = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    slots.push({
      x: -width / 2 + CAB.SIDE + DRAWER.GAP + c * (DRAWER.W + DRAWER.GAP) + DRAWER.W / 2,
      y: CAB.BASE + DRAWER.GAP + (rows - 1 - r) * (DRAWER.H + DRAWER.GAP) + DRAWER.H / 2,
    });
  }
  return { cols, rows, width, height, depth: CAB.DEPTH, z: CAB.Z, slots };
}

export function deskPose(slot, seed) {
  const r = seeded(seed * 7 + 1);
  const col = slot % DESK.COLS;
  const row = Math.floor(slot / DESK.COLS);
  return {
    x: (col - (DESK.COLS - 1) / 2) * DESK.PITCH_X + jitter(r, 5),
    y: CARD.T / 2 + 0.1,
    z: DESK.FRONT - row * DESK.PITCH_Z + jitter(r, 4),
    ry: jitter(r, 0.07),
  };
}

export function pileBase(pi) {
  const col = pi % PILES.COLS;
  const row = Math.floor(pi / PILES.COLS);
  return { x: (col - (PILES.COLS - 1) / 2) * PILES.PITCH_X, z: PILES.BACK - row * PILES.PITCH_Z };
}

export function pilePose(pi, k, seed) {
  const b = pileBase(pi);
  const r = seeded(seed * 13 + 5);
  return { x: b.x + jitter(r, 3), y: CARD.T / 2 + 0.1 + k * (CARD.T + 0.15), z: b.z + jitter(r, 3), ry: jitter(r, 0.1) };
}

export function pileLabelPose(pi) {
  const b = pileBase(pi);
  return { x: b.x, z: b.z + PILES.LABEL };
}

const smooth = (x) => x * x * (3 - 2 * x);

export function cameraAt(p, aspect, cab) {
  const f = aspect < 1.3 ? clamp(1.3 / aspect, 1, 2.3) : 1;
  const t = Math.tan((FOV / 2) * Math.PI / 180);
  const dist = Math.max((cab.height / 2 + 30) / t, (cab.width / 2 + 30) / (t * aspect)) * 1.05;
  const keys = [
    { look: [0, 0, 135], off: [0, 460 * f, 440 * f] },
    { look: [0, 0, -240], off: [0, 500 * f, 420 * f] },
    { look: [0, cab.height * 0.47, cab.z], off: [0, dist * 0.3, dist] },
  ];
  const q = clamp(p, 0, 1);
  const seg = q < 0.5 ? 0 : 1;
  const u = smooth(seg ? (q - 0.5) / 0.5 : q / 0.5);
  const a = keys[seg];
  const b = keys[seg + 1];
  const look = a.look.map((v, k) => lerp(v, b.look[k], u));
  const off = a.off.map((v, k) => lerp(v, b.off[k], u));
  return { look, pos: look.map((v, k) => v + off[k]) };
}
