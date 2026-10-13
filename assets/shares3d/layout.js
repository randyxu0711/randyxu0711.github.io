import { clamp, lerp } from 'scene3d/anim.js';

export const CARD = { W: 127, H: 76, T: 0.6 };
export const DESK = { MIN: 4, MAX: 12, DAYS: 7, COLS: 4, PITCH_X: 150, PITCH_Z: 105, FRONT: 240 };
export const PILES = { MAX: 12, COLS: 4, PITCH_X: 150, PITCH_Z: 150, BACK: -90, LABEL: 56 };
export const DRAWER = { W: 150, H: 75, GAP: 6, D: 8 };
export const CAB = { Z: -480, DEPTH: 240, SIDE: 10, BASE: 24, TOP: 12 };
export const SPLIT = 60;
export const LABEL = { W: 140, H: 17.5 };
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
  else list.sort((a, b) => last(a) - last(b) || b.ids.length - a.ids.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return list.flatMap((d) => {
    if (d.ids.length <= SPLIT) return [{ ...d, part: 0, parts: 1 }];
    const parts = Math.ceil(d.ids.length / SPLIT);
    return Array.from({ length: parts }, (_, k) => ({ ...d, ids: d.ids.slice(k * SPLIT, (k + 1) * SPLIT), part: k + 1, parts }));
  });
}

export function cabinet(n, cols = n > 16 ? 5 : Math.max(1, Math.min(4, n)), z = CAB.Z) {
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
  return { cols, rows, width, height, depth: CAB.DEPTH, z, slots };
}

const DESK_ROWS = Math.ceil(DESK.MAX / DESK.COLS);
const PILE_ROWS = Math.ceil(PILES.MAX / PILES.COLS);
const LEAD = DESK.FRONT - (DESK_ROWS - 1) * DESK.PITCH_Z - PILES.BACK;
const TAIL = PILES.BACK - (PILE_ROWS - 1) * PILES.PITCH_Z - CAB.Z;

export function arrange(nDesk, nPiles, nDrawers, narrow) {
  const cols = narrow ? 2 : DESK.COLS;
  const deskRows = narrow ? Math.max(1, Math.ceil(nDesk / cols)) : DESK_ROWS;
  const pileCols = narrow ? 2 : PILES.COLS;
  const pileRows = narrow ? Math.max(1, Math.ceil(nPiles / pileCols)) : PILE_ROWS;
  const front = DESK.FRONT;
  const pileBack = front - (deskRows - 1) * DESK.PITCH_Z - LEAD;
  const z = pileBack - (pileRows - 1) * PILES.PITCH_Z - TAIL;
  const cab = narrow ? cabinet(nDrawers, Math.max(1, Math.min(2, nDrawers)), z) : cabinet(nDrawers, undefined, z);
  return { narrow: !!narrow, cols, deskRows, pileCols, pileRows, front, pileBack, cab };
}

const BASE = arrange(DESK.MAX, PILES.MAX, 0, false);

export function deskPose(slot, seed, a = BASE) {
  const r = seeded(seed * 7 + 1);
  const col = slot % a.cols;
  const row = Math.floor(slot / a.cols);
  return {
    x: (col - (a.cols - 1) / 2) * DESK.PITCH_X + jitter(r, 5),
    y: CARD.T / 2 + 0.1,
    z: a.front - row * DESK.PITCH_Z + jitter(r, 4),
    ry: jitter(r, 0.07),
  };
}

export function pileBase(pi, a = BASE) {
  const col = pi % a.pileCols;
  const row = Math.floor(pi / a.pileCols);
  return { x: (col - (a.pileCols - 1) / 2) * PILES.PITCH_X, z: a.pileBack - row * PILES.PITCH_Z };
}

export function pilePose(pi, k, seed, a = BASE) {
  const b = pileBase(pi, a);
  const r = seeded(seed * 13 + 5);
  return { x: b.x + jitter(r, 3), y: CARD.T / 2 + 0.1 + k * (CARD.T + 0.15), z: b.z + jitter(r, 3), ry: jitter(r, 0.1) };
}

export function pileLabelPose(pi, a = BASE) {
  const b = pileBase(pi, a);
  return { x: b.x, z: b.z + PILES.LABEL };
}

const smooth = (x) => x * x * (3 - 2 * x);
const TAN = Math.tan((FOV / 2) * Math.PI / 180);
const FIT = { X: 0.96, Y: 0.94, STACK: 16 };
const reach = (ry, jx, jz) => ({
  x: (CARD.W / 2) * Math.cos(ry) + (CARD.H / 2) * Math.sin(ry) + jx,
  z: (CARD.H / 2) * Math.cos(ry) + (CARD.W / 2) * Math.sin(ry) + jz,
});

function ndc(pos, look, aspect, pt) {
  const f = look.map((v, k) => v - pos[k]);
  const fl = Math.hypot(...f);
  const fw = f.map((v) => v / fl);
  const rl = Math.hypot(fw[2], fw[0]);
  const right = [-fw[2] / rl, 0, fw[0] / rl];
  const up = [right[1] * fw[2] - right[2] * fw[1], right[2] * fw[0] - right[0] * fw[2], right[0] * fw[1] - right[1] * fw[0]];
  const d = pt.map((v, k) => v - pos[k]);
  const dot = (u) => u[0] * d[0] + u[1] * d[1] + u[2] * d[2];
  const depth = dot(fw);
  return [dot(right) / depth / (TAN * aspect), dot(up) / depth / TAN];
}

function fit(look, off, s0, aspect, hx, z0, z1) {
  const pts = [];
  for (const x of [-hx, hx]) for (const y of [0, FIT.STACK]) for (const z of [z0, z1]) pts.push([x, y, z]);
  const ok = (s) => pts.every((pt) => {
    const [x, y] = ndc(look.map((v, k) => v + off[k] * s), look, aspect, pt);
    return Math.abs(x) <= FIT.X && Math.abs(y) <= FIT.Y;
  });
  if (ok(s0)) return off.map((v) => v * s0);
  let lo = s0;
  let hi = s0 * 1.25;
  for (let k = 0; k < 24 && !ok(hi); k++) {
    lo = hi;
    hi *= 1.25;
  }
  for (let k = 0; k < 20; k++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return off.map((v) => v * hi);
}

export function cameraAt(p, aspect, a) {
  const f = aspect < 1.3 ? clamp(1.3 / aspect, 1, 2.3) : 1;
  const cab = a.cab;
  const deskBack = a.front - (a.deskRows - 1) * DESK.PITCH_Z;
  const pileEnd = a.pileBack - (a.pileRows - 1) * PILES.PITCH_Z;
  const d = reach(0.07, 5, 4);
  const q0 = reach(0.1, 3, 3);
  const deskLook = [0, 0, (a.front + deskBack) / 2];
  const pileLook = [0, 0, (a.pileBack + pileEnd) / 2];
  const deskX = ((a.cols - 1) / 2) * DESK.PITCH_X + d.x;
  const pileX = ((a.pileCols - 1) / 2) * PILES.PITCH_X + Math.max(q0.x, LABEL.W / 2);
  const wide = (cab.width / 2 + 30) / (TAN * aspect) * 1.05;
  const tall = (cab.height / 2 + 30) / TAN * 1.05;
  const dist = a.narrow ? wide : Math.max(wide, tall);
  const keys = [
    { look: deskLook, off: a.narrow ? fit(deskLook, [0, 460, 440], 1, aspect, deskX, a.front + d.z, deskBack - d.z) : [0, 460 * f, 440 * f] },
    { look: pileLook, off: fit(pileLook, [0, 500, 420], a.narrow ? 1 : f, aspect, pileX, a.pileBack + Math.max(q0.z, PILES.LABEL + LABEL.H / 2), pileEnd - q0.z) },
  ];
  const off = [0, dist * 0.3, dist];
  let marks = [0, 0.5, 1];
  if (dist < tall) {
    const view = TAN * dist * 0.8;
    const low = view;
    const high = Math.max(low, cab.height - view);
    keys.push({ look: [0, high, cab.z], off }, { look: [0, low, cab.z], off });
    marks = [0, 0.5, 0.8, 1];
  } else {
    keys.push({ look: [0, cab.height * 0.47, cab.z], off });
  }
  const q = clamp(p, 0, 1);
  let seg = 0;
  while (seg < marks.length - 2 && q >= marks[seg + 1]) seg++;
  const u = smooth((q - marks[seg]) / (marks[seg + 1] - marks[seg]));
  const ka = keys[seg];
  const kb = keys[seg + 1];
  const look = ka.look.map((v, k) => lerp(v, kb.look[k], u));
  const o = ka.off.map((v, k) => lerp(v, kb.off[k], u));
  return { look, pos: look.map((v, k) => v + o[k]) };
}
