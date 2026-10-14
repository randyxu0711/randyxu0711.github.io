export const CARD = { W: 127, H: 104, T: 0.6 };
export const IMG = { H: 66.5 };
export const DESK = { N: 6, COLS: 3, PITCH_X: 158, PITCH_Z: 138, FRONT: 260, BACK: 60, GAP: 12 };
export const DRAWER = { W: 150, H: 75, GAP: 6, D: 8 };
export const CAB = { Z: -480, DEPTH: 240, SIDE: 10, BASE: 24, TOP: 12 };
export const SPLIT = 60;
export const LABEL = { W: 140, H: 17.5 };
export const FOV = 35;
export const PITCH = { DESK: (36 * Math.PI) / 180, CAB: (8 * Math.PI) / 180 };
export const THUMB = 'https://wsrv.nl/?url=';

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

export function recent(items) {
  return items.slice(0, DESK.N).map((_, i) => i);
}

export function thumb(url) {
  return url ? `${THUMB}${encodeURIComponent(url)}&w=640&h=336&fit=cover&output=webp` : null;
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

const TAN = Math.tan((FOV / 2) * Math.PI / 180);
const FIT = { X: 1, NARROW: 0.96, Y: 0.94 };

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

export function arrange(nDesk, nDrawers, narrow) {
  const cols = narrow ? 2 : DESK.COLS;
  const rows = Math.max(1, Math.ceil(nDesk / cols));
  const front = DESK.FRONT;
  const back = front - (rows - 1) * DESK.PITCH_Z;
  const z = back - CARD.H / 2 - DESK.BACK;
  const cab = narrow ? cabinet(nDrawers, Math.max(1, Math.min(2, nDrawers)), z) : cabinet(nDrawers, undefined, z);
  return { narrow: !!narrow, cols, rows, front, cab };
}

const BASE = arrange(DESK.N, 0, false);

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

export function liftPose(slot, seed, a = BASE) {
  const p = deskPose(slot, seed, a);
  return { x: p.x, y: (CARD.H / 2) * Math.cos(PITCH.DESK) + DESK.GAP, z: p.z + 10, rx: -PITCH.DESK, ry: 0 };
}

const view = (look, dist, pitch, shift) => {
  const up = [0, Math.cos(pitch), -Math.sin(pitch)];
  const s = shift * 2 * TAN * dist;
  const at = look.map((v, k) => v - up[k] * s);
  return { look: at, pos: [at[0], at[1] + dist * Math.sin(pitch), at[2] + dist * Math.cos(pitch)] };
};

export function deskCam(pose, aspect, a = BASE) {
  const fw = a.narrow ? 0.86 : 0.46;
  const dist = Math.max(CARD.W / (fw * 2 * TAN * aspect), (CARD.H + 12) / (0.62 * 2 * TAN));
  return view([pose.x, pose.y, pose.z], dist, PITCH.DESK, -0.03);
}

export function cabCam(aspect, a = BASE) {
  const cab = a.cab;
  const wide = (cab.width / 2 + 24) / (TAN * aspect * (a.narrow ? 0.96 : 0.92));
  const tall = (cab.height / 2 + 24) / (TAN * (a.narrow ? 0.7 : 0.8));
  return view([0, cab.height / 2, cab.z], Math.max(wide, tall), PITCH.CAB, a.narrow ? 0.12 : 0.06);
}

export const PULL = CAB.DEPTH - 60;
export const LEAN = { FORWARD: 0.62, BACK: -0.35, FRONT: 64, FLOOR: 6 };

export function drawerOut(cab, k) {
  const s = cab.slots[k];
  return { x: s.x, y: s.y, z: cab.z + PULL };
}

export function drawerCards(n, cur) {
  const room = CAB.DEPTH - 20 - LEAN.FRONT - Math.sin(-LEAN.BACK) * CARD.H - 4;
  const step = n > 1 ? Math.min(4, room / (n - 1)) : 0;
  const floor = -DRAWER.H / 2 + LEAN.FLOOR;
  return Array.from({ length: n }, (_, k) => {
    const r = k < cur ? LEAN.FORWARD : LEAN.BACK;
    return {
      y: floor + Math.cos(r) * (CARD.H / 2),
      z: -LEAN.FRONT - k * step + Math.sin(r) * (CARD.H / 2),
      rx: r,
    };
  });
}

function fitBox(look, off, aspect, box, mx) {
  const pts = [];
  for (const x of [box.x0, box.x1]) for (const y of [box.y0, box.y1]) for (const z of [box.z0, box.z1]) pts.push([x, y, z]);
  const ok = (s) => pts.every((pt) => {
    const [x, y] = ndc(look.map((v, k) => v + off[k] * s), look, aspect, pt);
    return Math.abs(x) <= mx && Math.abs(y) <= FIT.Y;
  });
  let lo = 0.2;
  let hi = 1;
  for (let k = 0; k < 24 && !ok(hi); k++) {
    lo = hi;
    hi *= 1.25;
  }
  for (let k = 0; k < 20; k++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return look.map((v, k) => v + off[k] * hi);
}

export function focusDrawer(out, aspect, a = BASE) {
  const box = {
    x0: out.x - DRAWER.W / 2 - 10, x1: out.x + DRAWER.W / 2 + 10,
    y0: out.y - DRAWER.H / 2, y1: out.y + CARD.H,
    z0: out.z - CAB.DEPTH + 30, z1: out.z + DRAWER.D,
  };
  const look = [out.x, out.y - 22, out.z - 95];
  return { look, pos: fitBox(look, [0, 330, 270], aspect, box, a.narrow ? FIT.NARROW : FIT.X) };
}

export function matches(item, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = [item.t, item.s, item.n, item.e, ...(item.g || [])].filter(Boolean).join(' ').toLowerCase();
  return words.every((w) => text.includes(w));
}
