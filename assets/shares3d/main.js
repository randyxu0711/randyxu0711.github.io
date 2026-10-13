import { readTokens, rgba, watchTheme } from 'scene3d/colors.js';
import { ease, clamp, approach } from 'scene3d/anim.js';
import { introK, introLevels, LIGHT_MIN, LIGHT_MAX } from 'scene3d/intro.js';
import {
  CARD, CAB, taipeiToday, pickDesk, groups, arrange, deskPose, pilePose, pileLabelPose, makeCamera, mainName, hueOf, tabSlot,
  spreadPoses, pileBase, drawerOut, drawerCards, focusPile, focusDrawer, matches, PULL,
} from 'shares3d/layout.js';
import { createScene, quat, blend } from 'shares3d/scene.js';
import { createAtlas, createLabels, loadFonts } from 'shares3d/textures.js';
import { createHeld } from 'shares3d/held.js';
import { createHint } from 'shares3d/hint.js';

const root = document.getElementById('sh3d');
const stage = document.getElementById('sh3d-stage');
const bar = document.getElementById('sh3d-bar');
const peek = document.getElementById('sh3d-peek');
const hintEl = document.getElementById('sh3d-hint');
const qEl = document.getElementById('sh3d-q');
const found = document.getElementById('sh3d-found');
const list = document.getElementById('sh3d-list');
const items = JSON.parse(document.getElementById('sh3d-data').textContent);
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarse = window.matchMedia('(pointer: coarse)');
const GROUP_KEY = 'shares3d-group';
const MODES = ['tag', 'source', 'month'];
const TOKENS = ['desk', 'face', 'paper', 'paper-deep', 'edge', 'edge-n', 'edge-n-deep', 'ink', 'ink-3', 'rule', 'redline', 'sticky', 'drop-near', 'unlit'];
const SEEN_KEY = 'seen-links';
const MISS = 0.6;
const CABINET_AT = 0.74;
const SLIDE = 380;
const STAGGER = 45;
const LIFT = 4;
const TUG = 10;
const RELEASE = 140;
const HELD_DIST = 300;
const FLAT = -Math.PI / 2;
const FADE = { desk: { cab: 0.6, drawer: 0.6, held: 0.35, pile: 0.35 }, cab: { desk: 0.15, pile: 0.15, held: 0.35 }, other: 0.5 };

const t = (k, n) => (window.siteI18n ? window.siteI18n.t(k, n) : k);
const lang = () => (document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'zh');
const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const gap = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const moved = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) + Math.abs(a.q[0] - b.q[0]) + Math.abs(a.q[1] - b.q[1]) + Math.abs(a.q[2] - b.q[2]) + Math.abs((a.s || 1) - (b.s || 1));

function monthName(key) {
  const [y, m] = key.split('-').map(Number);
  if (lang() === 'zh') return `${y} 年 ${m} 月`;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function drawerName(d) {
  const name = d.kind === 'other' ? t('shares3d.other') : d.kind === 'untagged' ? t('shares3d.untagged') : d.kind === 'month' ? monthName(d.key) : d.key;
  return d.parts > 1 ? `${name} · ${d.part}` : name;
}

function start() {
  if (!items.length) {
    root.classList.add('fail');
    return;
  }
  let gl;
  try {
    gl = createScene(items.length);
  } catch (e) {
    console.error(e);
    root.classList.add('fail');
    return;
  }
  const canvas = gl.canvas;
  canvas.className = 'sh3d-canvas s3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  root.appendChild(canvas);
  root.classList.add('on');
  try {
    run(gl, canvas);
  } catch (e) {
    console.error(e);
    root.classList.remove('on');
    root.classList.add('fail');
    canvas.remove();
    stage.hidden = true;
    bar.hidden = true;
  }
}

function run(gl, canvas) {
  stage.hidden = false;
  bar.hidden = false;

  let mode = 'tag';
  try {
    const m = localStorage.getItem(GROUP_KEY);
    if (MODES.includes(m)) mode = m;
  } catch (e) {}
  const { desk, piles } = pickDesk(items, taipeiToday(Date.now()));
  let drawers = groups(items, mode);
  const isNarrow = () => canvas.clientWidth / Math.max(1, canvas.clientHeight) < 1;
  let narrow = isNarrow();
  let a = arrange(desk.length, piles.length, drawers.length, narrow);
  let cab = a.cab;
  let camFn = null;
  let camAspect = 0;
  let slide = null;
  let dark = false;
  let raf = 0;
  let last = 0;
  let ready = false;
  let dirty = true;
  let focus = null;
  let held = null;
  let hover = null;
  let closing = null;
  const cam = { pos: null, look: null };
  const lamp = { pos: null };
  const pointer = { x: 0, y: 0, on: false, moved: false };
  const tints = new Map();
  const poses = new Map();
  const fronts = drawers.map(() => 0);
  const fades = { desk: 0, cab: 0, drawers: drawers.map(() => 0) };
  let entries = [];
  let tokens = null;
  let hits = null;
  let fontsDone = false;
  let liveT0 = 0;
  let litT0 = 0;
  let lit = false;
  let quick = null;
  const veil = getComputedStyle(root, '::before');
  const darkness = veil.content === 'none' ? 0 : parseFloat(veil.opacity) || 0;
  let intro = darkness > 0;
  if (!intro) root.classList.add('soft');

  function loadSeen() {
    try {
      const v = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      return new Set(Array.isArray(v) ? v : []);
    } catch (e) {
      return new Set();
    }
  }
  function markSeen() {
    const seen = loadSeen();
    const changed = [];
    items.forEach((it, i) => {
      const v = !!(it.l && seen.has(it.l));
      if (v !== !!it.seen) {
        it.seen = v;
        changed.push(i);
      }
    });
    return changed;
  }
  markSeen();

  function tint(kind, key) {
    const id = kind + key;
    if (!tints.has(id)) {
      const h = hueOf(key);
      const css = kind === 'stamp' ? (dark ? `oklch(0.74 0.1 ${h})` : `oklch(0.5 0.13 ${h})`) : (dark ? `oklch(0.56 0.1 ${h})` : `oklch(0.76 0.11 ${h})`);
      tints.set(id, { css, rgb: rgba(css).slice(0, 3) });
    }
    return tints.get(id);
  }

  const atlas = createAtlas(gl, items, () => {
    dirty = true;
    invalidate();
  });
  const labels = createLabels((tex) => gl.setTextures(null, tex));
  gl.setTextures(atlas.texture, null);
  const card = createHeld(t);
  const hint = createHint(hintEl, t);

  function wanted() {
    const out = [...desk, ...piles.map((p) => p.ids[0])];
    if (focus && focus.kind === 'pile') out.push(...piles[focus.pi].ids);
    if (focus && focus.kind === 'drawer') out.push(...drawers[focus.k].ids);
    if (held) out.push(held.entry.i);
    return [...new Set(out)];
  }

  function progress() {
    const span = stage.offsetHeight - window.innerHeight;
    return span > 0 ? clamp(-stage.getBoundingClientRect().top / span, 0, 1) : 0;
  }

  function stageName(p) {
    if (held) return 'held';
    if (focus) return focus.kind;
    return p > CABINET_AT ? 'cab' : 'desk';
  }

  function openDrawerIndex() {
    if (focus && focus.kind === 'drawer') return focus.k;
    return closing ? closing.k : -1;
  }

  function relink() {
    if (held) held.entry = entries.find((e) => e.key === held.entry.key) || held.entry;
  }

  function buildEntries() {
    const out = [];
    desk.forEach((i, slot) => out.push({ key: `d${i}`, i, where: 'd', slot }));
    piles.forEach((p, pi) => {
      const stack = p.ids.slice().reverse();
      stack.forEach((i, k) => out.push({ key: `p${i}`, i, where: 'p', pi, k, top: k === stack.length - 1, order: p.ids.indexOf(i) }));
    });
    const open = [...new Set([focus && focus.kind === 'drawer' ? focus.k : -1, closing ? closing.k : -1])].filter((k) => k >= 0);
    open.forEach((k) => drawers[k].ids.forEach((i, j) => out.push({ key: `x${k}:${i}`, i, where: 'x', k, j })));
    return out;
  }

  function frontPose(k) {
    return { x: cab.slots[k].x, y: cab.slots[k].y, z: cab.z + fronts[k] };
  }

  function targetOf(e) {
    const it = items[e.i];
    if (e.where === 'd') {
      const p = deskPose(e.slot, it.i, a);
      const lift = hover && hover.key === e.key ? LIFT : 0;
      return { x: p.x, y: p.y + lift, z: p.z, q: quat(FLAT, p.ry) };
    }
    if (e.where === 'p') {
      if (focus && focus.kind === 'pile' && focus.pi === e.pi) {
        const sp = focus.poses[e.order];
        const lift = hover && hover.key === e.key ? LIFT : 0;
        return { x: sp.x, y: sp.y + lift, z: sp.z, q: quat(FLAT, sp.ry) };
      }
      const p = pilePose(e.pi, e.k, it.i, a);
      const lift = hover && hover.key === e.key && e.top ? LIFT : 0;
      return { x: p.x, y: p.y + lift, z: p.z, q: quat(FLAT, p.ry) };
    }
    const f = frontPose(e.k);
    const cur = focus && focus.kind === 'drawer' && focus.k === e.k ? focus.cur : 0;
    const local = drawerCards(drawers[e.k].ids.length, cur)[e.j];
    return { x: f.x, y: f.y + local.y, z: f.z + local.z, q: quat(local.rx, 0) };
  }

  function fadeOf(e, matchFade) {
    if (held && held.entry.key === e.key) return 0;
    const base = e.where === 'x' ? fades.drawers[e.k] || 0 : fades.desk;
    if (e.where !== 'x' && focus && focus.kind === 'pile' && e.where === 'p' && e.pi === focus.pi) return Math.max(0, matchFade);
    return Math.max(base, matchFade);
  }

  function cardItem(e, pose) {
    const it = items[e.i];
    const tag = it.g[0] || '';
    const face = e.where === 'd' || e.where === 'x' || (e.where === 'p' && (e.top || (focus && focus.kind === 'pile' && focus.pi === e.pi))) || (held && held.entry.key === e.key);
    return {
      x: pose.x, y: pose.y, z: pose.z, q: pose.q, s: pose.s,
      tile: face ? atlas.tile(e.i) : null,
      stamp: it.x && tokens ? tokens.redline.slice(0, 3) : tint('stamp', mainName(it.s)).rgb,
      tab: { x: -CARD.W / 2 + 20 + tabSlot(tag) * 22, color: tint('tab', tag).rgb },
      sticky: !!it.n,
      fade: fadeOf(e, hits && !hits.has(e.i) ? MISS : 0),
      hot: e.where === 'd' && e.slot === 0 ? 1 : 0,
      hidden: held && held.entry.key === e.key && held.phase === 'dom',
    };
  }

  function shadowList() {
    const out = desk.map((i, slot) => {
      const p = deskPose(slot, items[i].i, a);
      const gone = held && held.entry.key === `d${i}`;
      return { x: p.x, z: p.z, ry: p.ry, w: CARD.W, h: CARD.H, fade: gone ? 1 : fades.desk };
    });
    piles.forEach((p, pi) => {
      const b = pilePose(pi, 0, items[p.ids[p.ids.length - 1]].i, a);
      const gone = (focus && focus.kind === 'pile' && focus.pi === pi) || (p.ids.length === 1 && held && held.entry.key === `p${p.ids[0]}`);
      out.push({ x: b.x, z: b.z, ry: b.ry, w: CARD.W, h: CARD.H, fade: gone ? 1 : fades.desk });
    });
    out.push({ x: 0, z: cab.z - cab.depth / 2 + 12, ry: 0, w: cab.width, h: cab.depth + 24, fade: fades.cab });
    return out;
  }

  function drawerList(now) {
    return drawers.map((d, k) => {
      let dz = 0;
      if (slide !== null) dz = -(CAB.DEPTH - 20) * (1 - ease(clamp((now - slide - k * STAGGER) / SLIDE, 0, 1)));
      const empty = hits && !d.ids.some((i) => hits.has(i));
      return { x: cab.slots[k].x, y: cab.slots[k].y, z: cab.z + fronts[k] + dz, tile: labels.drawerTile(k), fade: Math.max(fades.drawers[k] || 0, empty ? 0.5 : 0), hot: hover && hover.kind === 'drawer' && hover.k === k && !(focus && focus.kind === 'drawer' && focus.k === k) ? 1 : 0 };
    });
  }

  function drawLabels() {
    labels.draw(
      drawers.map((d) => ({ name: drawerName(d), count: t('shares3d.cards', hits ? `${d.ids.filter((i) => hits.has(i)).length} / ${d.ids.length}` : d.ids.length) })),
      piles.map((p) => `${t('shares3d.week', md(p.week))} · ${p.ids.length}`),
    );
    dirty = true;
  }

  function camTarget(p, aspect) {
    if (focus && focus.kind === 'pile') return focusPile(focus.poses, aspect, a);
    if (focus && focus.kind === 'drawer') return focusDrawer(drawerOut(cab, focus.k), aspect, a);
    if (!camFn || camAspect !== aspect) {
      camFn = makeCamera(aspect, a);
      camAspect = aspect;
    }
    return camFn(p);
  }

  function lampTarget(p, s) {
    if (s === 'held' && held && held.pose) {
      const h = held.pose;
      return { pos: [cam.pos[0] + (h.x - cam.pos[0]) * 0.4, cam.pos[1] + (h.y - cam.pos[1]) * 0.4 + 60, cam.pos[2] + (h.z - cam.pos[2]) * 0.4], reach: 260 };
    }
    if (s === 'drawer') {
      const f = frontPose(focus.k);
      return { pos: [f.x, f.y + 170, f.z + 40], reach: 300 };
    }
    if (s === 'pile') return { pos: [focus.look[0], 230, focus.look[2] + 60], reach: 380 };
    if (s === 'cab' || p > CABINET_AT) return { pos: [0, cab.height + 120, cab.z + 260], reach: 520 };
    const hit = pointer.on ? gl.deskPoint(pointer.x, pointer.y) : null;
    const x = hit ? hit[0] : cam.look[0];
    const z = hit ? Math.max(hit[2], cab.z + 60) : cam.look[2];
    return { pos: [x, 260, z + 40], reach: 380 };
  }

  function siblings(e) {
    if (e.where === 'd') return desk.map((i) => entries.find((x) => x.key === `d${i}`));
    if (e.where === 'p') return piles[e.pi].ids.map((i) => entries.find((x) => x.key === `p${i}`));
    return drawers[e.k].ids.map((i, j) => entries.find((x) => x.where === 'x' && x.k === e.k && x.j === j));
  }

  function itemFor(e) {
    const it = items[e.i];
    const tag = it.g[0] || '';
    const here = e.where === 'x' && mode === 'tag' ? drawers[e.k].key : null;
    return {
      t: it.t, s: it.s, d: it.d, g: it.g, n: it.n, e: it.e, m: it.m, u: it.u, x: it.x,
      stamp: it.x ? 'var(--redline)' : tint('stamp', mainName(it.s)).css, tab: tint('tab', tag).css, slot: tabSlot(tag),
      also: here !== null ? it.g.filter((g) => g !== here) : [],
    };
  }

  function hold(e) {
    if (held) return;
    held = { entry: e, phase: 'fly', pose: null };
    card.fill(itemFor(e));
    peek.hidden = true;
    bar.classList.add('holding');
    atlas.want(wanted());
    dirty = true;
    invalidate();
  }

  function release() {
    if (!held) return;
    card.hide();
    held = null;
    bar.classList.remove('holding');
    dirty = true;
    invalidate();
  }

  function nextIndex(list, from, dir) {
    for (let j = from + dir; j >= 0 && j < list.length; j += dir) {
      if (list[j] && (!hits || hits.has(list[j].i))) return j;
    }
    return -1;
  }

  function step(dir) {
    if (!held || held.phase !== 'dom' || card.busy()) return;
    const list = siblings(held.entry);
    const j = nextIndex(list, list.indexOf(held.entry), dir);
    if (j < 0) {
      card.bump(dir);
      return;
    }
    const prev = held.entry;
    poses.set(prev.key, targetOf(prev));
    held.entry = list[j];
    if (held.pose) poses.set(held.entry.key, held.pose);
    if (focus && focus.kind === 'drawer' && held.entry.where === 'x') focus.cur = held.entry.j;
    card.step(dir, itemFor(held.entry));
    atlas.want(wanted());
    dirty = true;
    invalidate();
  }

  function recordSeen(e) {
    const link = items[e.i].l;
    if (!link) return;
    try {
      const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      if (Array.isArray(seen) && !seen.includes(link)) {
        seen.push(link);
        localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
      }
    } catch (err) {}
    const clear = document.getElementById('seen-clear');
    if (clear) clear.hidden = false;
    refreshSeen();
  }

  function refreshSeen() {
    const changed = markSeen();
    if (changed.length) {
      atlas.refresh(changed);
      invalidate();
    }
  }

  card.onAction((act) => {
    if (act === 'close') release();
    else if (act === 'prev') step(-1);
    else if (act === 'next') step(1);
    else if (act === 'open' && held) recordSeen(held.entry);
  });

  function setFocus(f) {
    if (focus && focus.kind === 'drawer' && (!f || f.kind !== 'drawer' || f.k !== focus.k)) closing = { k: focus.k };
    if (!f) peek.hidden = true;
    pointer.moved = true;
    focus = f ? Object.assign({ at: window.scrollY }, f) : null;
    if (focus && focus.kind === 'pile') {
      focus.poses = spreadPoses(piles[focus.pi].ids.length, pileBase(focus.pi, a), a);
      const xs = focus.poses.map((q) => q.x);
      const zs = focus.poses.map((q) => q.z);
      focus.look = [(Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2];
    }
    if (focus && focus.kind === 'drawer' && closing && closing.k === focus.k) closing = null;
    hover = null;
    atlas.want(wanted());
    entries = buildEntries();
    relink();
    dirty = true;
    invalidate();
  }

  function flipTo(j) {
    if (!focus || focus.kind !== 'drawer') return;
    const n = drawers[focus.k].ids.length;
    const next = clamp(j, 0, n - 1);
    if (next === focus.cur) return;
    focus.cur = next;
    showPeek(entries.find((e) => e.where === 'x' && e.k === focus.k && e.j === next));
    dirty = true;
    invalidate();
  }

  function showPeek(e) {
    if (!e || held) {
      peek.hidden = true;
      return;
    }
    const it = items[e.i];
    peek.replaceChildren(it.t);
    const s = document.createElement('small');
    s.textContent = `${it.s} · ${md(it.d)}${e.where === 'x' ? ` · ${drawerName(drawers[e.k])}` : ''}`;
    peek.append(s);
    peek.hidden = false;
  }

  function resolve(hit) {
    if (!hit) return null;
    if (hit.kind === 'drawer') return { kind: 'drawer', k: hit.index };
    const e = entries[hit.index];
    return e ? { kind: 'card', key: e.key, entry: e } : null;
  }

  function interact(hit) {
    if (held) {
      release();
      return;
    }
    if (!hit) {
      if (focus) setFocus(null);
      return;
    }
    if (hit.kind === 'drawer') {
      if (focus && focus.kind === 'drawer' && focus.k === hit.k) setFocus(null);
      else setFocus({ kind: 'drawer', k: hit.k, cur: 0 });
      return;
    }
    const e = hit.entry;
    if (e.where === 'p' && !(focus && focus.kind === 'pile' && focus.pi === e.pi)) {
      setFocus({ kind: 'pile', pi: e.pi });
      return;
    }
    if (e.where === 'x' && focus && focus.kind === 'drawer' && e.k === focus.k && e.j !== focus.cur) {
      flipTo(e.j);
      return;
    }
    hold(e);
  }

  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let busy = atlas.pump() || atlas.pending();
    const p = progress();
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const s = stageName(p);
    const k = reduce.matches ? 1 : 1 - Math.exp(-dt * 10);
    const kf = reduce.matches ? 1 : 1 - Math.exp(-dt * 4);

    if (pointer.moved && !held && !coarse.matches && lit) {
      pointer.moved = false;
      const h = pointer.on ? resolve(gl.pick(pointer.x, pointer.y)) : null;
      const before = hover ? hover.key || `k${hover.k}` : '';
      hover = h && (h.kind === 'drawer' || h.entry.where !== 'x') ? h : null;
      if (h && h.kind === 'card' && h.entry.where === 'x' && focus && focus.kind === 'drawer' && h.entry.k === focus.k && (!hits || hits.has(h.entry.i))) flipTo(h.entry.j);
      const after = hover ? hover.key || `k${hover.k}` : '';
      if (before !== after) dirty = true;
      stage.style.cursor = h ? 'pointer' : '';
      if (hover && hover.kind === 'card') showPeek(hover.entry);
      else if (!(focus && focus.kind === 'drawer')) peek.hidden = true;
    }

    const target = camTarget(p, aspect);
    if (!cam.pos || reduce.matches) {
      cam.pos = target.pos.slice();
      cam.look = target.look.slice();
    } else {
      for (let q = 0; q < 3; q++) {
        cam.pos[q] = approach(cam.pos[q], target.pos[q], dt, 8);
        cam.look[q] = approach(cam.look[q], target.look[q], dt, 8);
      }
    }
    if (gap(cam.pos, target.pos) + gap(cam.look, target.look) > 0.1) busy = true;

    const wantDesk = FADE.desk[s] || 0;
    const wantCab = FADE.cab[s] || 0;
    if (Math.abs(fades.desk - wantDesk) > 0.002) { fades.desk += (wantDesk - fades.desk) * kf; busy = true; dirty = true; }
    if (Math.abs(fades.cab - wantCab) > 0.002) { fades.cab += (wantCab - fades.cab) * kf; busy = true; dirty = true; }
    drawers.forEach((d, i) => {
      const w = s === 'drawer' && focus.k !== i ? FADE.other : wantCab;
      const cur = fades.drawers[i] || 0;
      if (Math.abs(cur - w) > 0.002) { fades.drawers[i] = cur + (w - cur) * kf; busy = true; dirty = true; }
      const out = focus && focus.kind === 'drawer' && focus.k === i ? PULL : hover && hover.kind === 'drawer' && hover.k === i ? TUG : 0;
      if (Math.abs(fronts[i] - out) > 0.05) { fronts[i] = reduce.matches ? out : approach(fronts[i], out, dt, 9); busy = true; dirty = true; }
    });
    if (closing && fronts[closing.k] < 1) {
      closing = null;
      entries = buildEntries();
      relink();
      dirty = true;
    }

    if (held) {
      const rect = card.target();
      gl.aim(cam);
      held.pose = gl.heldPose(rect, HELD_DIST);
    }

    const list = [];
    entries.forEach((e) => {
      const goal = held && held.entry.key === e.key && held.pose ? held.pose : targetOf(e);
      let cur = poses.get(e.key);
      if (!cur) cur = goal;
      else if (moved(cur, goal) > 0.01) {
        cur = blend(cur, goal, k);
        busy = true;
        dirty = true;
      } else if (cur !== goal) {
        cur = goal;
        dirty = true;
      }
      poses.set(e.key, cur);
      list.push(cardItem(e, cur));
      if (held && held.entry.key === e.key && held.phase === 'fly' && moved(cur, goal) < 0.05) {
        held.phase = 'swap';
        card.show();
        const h = held;
        setTimeout(() => {
          if (held !== h) return;
          h.phase = 'dom';
          card.paste();
          dirty = true;
          invalidate();
        }, reduce.matches ? 0 : 180);
      }
    });

    if (slide !== null) {
      if (now - slide > SLIDE + STAGGER * drawers.length) slide = null;
      busy = true;
      dirty = true;
    }

    if (dirty) {
      gl.setCards(list);
      gl.setDrawers(drawerList(now));
      gl.setShadows(shadowList());
      gl.setCabinet(cab, fades.cab);
      gl.setPileLabels(piles.map((pl, pi) => Object.assign(pileLabelPose(pi, a), { tile: labels.pileTile(pi), fade: fades.desk })));
      const ok = openDrawerIndex();
      gl.setTray(ok >= 0 ? Object.assign(frontPose(ok), { fade: fades.drawers[ok] || 0 }) : null);
      dirty = false;
    }

    const lt = lampTarget(p, s);
    if (!lamp.pos || reduce.matches) lamp.pos = lt.pos.slice();
    else {
      for (let q = 0; q < 3; q++) lamp.pos[q] = approach(lamp.pos[q], lt.pos[q], dt, 6);
      if (gap(lamp.pos, lt.pos) > 0.5 && dark) busy = true;
    }
    gl.setLamp(dark && lit, lamp.pos[0], lamp.pos[1], lamp.pos[2], lt.reach);
    if (intro && liveT0 && stepLight(now)) busy = true;

    bar.classList.toggle('at-cab', s === 'cab' || s === 'drawer');
    const count = s === 'drawer' ? `${focus.cur + 1} / ${drawers[focus.k].ids.length}` : s === 'held' ? (() => {
      const l = siblings(held.entry);
      return `${l.indexOf(held.entry) + 1} / ${l.length}`;
    })() : '';
    hint.set(s, count, coarse.matches);

    gl.render(cam);
    if (!liveT0) {
      liveT0 = now;
      root.classList.add('live');
      if (intro) busy = true;
      else switchOn(now);
    }
    if (busy) invalidate();
    else last = 0;
  }

  function invalidate() {
    if (!raf && ready) raf = requestAnimationFrame(frame);
  }

  function deskReady() {
    return fontsDone && [...desk, ...piles.map((p) => p.ids[0])].every((i) => atlas.tile(i));
  }

  function switchOn(now) {
    litT0 = now;
    lit = true;
    root.classList.add('lit');
    pointer.moved = true;
  }

  function applyIntro(el) {
    const k = introK(el, { reduce: reduce.matches, lampOn: dark, quick });
    if (k === 0) intro = false;
    const v = introLevels(k, intro, dark, darkness);
    gl.setIntro(v.unlit, v.sketch);
  }

  function stepLight(now) {
    if (!lit) {
      const el = now - liveT0;
      if (quick === null && el >= LIGHT_MIN) quick = deskReady();
      if (el >= LIGHT_MAX || (el >= LIGHT_MIN && deskReady())) switchOn(now);
    }
    applyIntro(lit ? now - litT0 : -1);
    return intro;
  }

  function applyColors() {
    tokens = readTokens(TOKENS);
    gl.setColors(tokens);
    const d = tokens.desk;
    dark = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2] < 0.3;
    tints.clear();
    if (held) {
      const it = itemFor(held.entry);
      card.recolor(it.stamp, it.tab);
    }
    if (!liveT0 && !dark) root.classList.add('soft');
    if (intro) applyIntro(lit ? performance.now() - litT0 : -1);
    dirty = true;
    invalidate();
  }

  function setQuery(q) {
    const words = q.trim();
    hits = words ? new Set(items.map((it, i) => (matches(it, words) ? i : -1)).filter((i) => i >= 0)) : null;
    found.hidden = !hits;
    if (hits) found.textContent = t('shares3d.matches', hits.size);
    if (hits && focus && focus.kind === 'drawer') {
      const ids = drawers[focus.k].ids;
      if (!hits.has(ids[focus.cur])) {
        const j = ids.findIndex((i) => hits.has(i));
        if (j >= 0) focus.cur = j;
      }
    }
    drawLabels();
    dirty = true;
    invalidate();
  }

  function scrollToStage(p) {
    const top = stage.getBoundingClientRect().top + window.scrollY;
    const span = stage.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + span * p, behavior: 'instant' });
  }

  function reveal(i) {
    release();
    const d = desk.indexOf(i);
    if (d >= 0) {
      if (focus) setFocus(null);
      scrollToStage(0);
      return entries.find((e) => e.key === `d${i}`);
    }
    const pi = piles.findIndex((pl) => pl.ids.includes(i));
    if (pi >= 0) {
      scrollToStage(0.5);
      setFocus({ kind: 'pile', pi });
      return entries.find((e) => e.key === `p${i}`);
    }
    const k = drawers.findIndex((dr) => dr.ids.includes(i));
    if (k < 0) return null;
    scrollToStage(1);
    setFocus({ kind: 'drawer', k, cur: drawers[k].ids.indexOf(i) });
    return entries.find((e) => e.where === 'x' && e.k === k && e.i === i);
  }

  function pressKeys() {
    bar.querySelectorAll('[data-group-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.groupSet === mode)));
  }

  function setMode(m, keep = true) {
    if (m === mode || !MODES.includes(m)) return;
    mode = m;
    if (keep) {
      try { localStorage.setItem(GROUP_KEY, m); } catch (e) {}
    }
    pressKeys();
    release();
    if (focus) setFocus(null);
    closing = null;
    drawers = groups(items, mode);
    slide = reduce.matches ? null : performance.now();
    rearrange();
    invalidate();
  }

  function rearrange() {
    a = arrange(desk.length, piles.length, drawers.length, narrow);
    cab = a.cab;
    camFn = null;
    fronts.length = 0;
    drawers.forEach(() => fronts.push(0));
    fades.drawers = drawers.map(() => fades.cab);
    if (focus && focus.kind === 'pile') setFocus({ kind: 'pile', pi: focus.pi });
    entries = buildEntries();
    relink();
    drawLabels();
    dirty = true;
  }

  bar.querySelectorAll('[data-group-set]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.groupSet)));
  qEl.addEventListener('input', () => setQuery(qEl.value));
  qEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    qEl.value = '';
    setQuery('');
    qEl.blur();
    e.preventDefault();
  });
  const clearBtn = document.getElementById('seen-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => setTimeout(refreshSeen, 0));
  window.addEventListener('storage', (e) => { if (e.key === SEEN_KEY) refreshSeen(); });
  list.addEventListener('focusin', (e) => {
    const art = e.target.closest && e.target.closest('article.share');
    if (!art || !lit) return;
    const i = items.findIndex((it) => it.l === art.getAttribute('data-link'));
    if (i < 0) return;
    const en = reveal(i);
    hover = en && en.where !== 'x' ? { kind: 'card', key: en.key, entry: en } : null;
    showPeek(en);
    dirty = true;
    invalidate();
  });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const art = e.target.closest && e.target.closest('article.share');
    if (!art || !lit) return;
    const i = items.findIndex((it) => it.l === art.getAttribute('data-link'));
    const en = i >= 0 ? reveal(i) : null;
    if (!en) return;
    e.preventDefault();
    hold(en);
  });

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.on = e.target === stage;
    pointer.moved = true;
    invalidate();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.on = false;
    pointer.moved = true;
    invalidate();
  });
  stage.addEventListener('click', (e) => {
    if (!root.classList.contains('lit') || e.detail > 1 || (held && held.phase !== 'dom')) return;
    const r = canvas.getBoundingClientRect();
    interact(resolve(gl.pick(e.clientX - r.left, e.clientY - r.top)));
  });
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (held) {
      if (e.key === 'Escape' && held.phase !== 'dom') {
        release();
        e.preventDefault();
      }
      return;
    }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
    if (e.key === '/' && lit) {
      qEl.focus();
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && focus) {
      setFocus(null);
      e.preventDefault();
      return;
    }
    if (!focus || focus.kind !== 'drawer') return;
    const back = ['ArrowUp', 'ArrowLeft', 'k'].includes(e.key);
    const fwd = ['ArrowDown', 'ArrowRight', 'j'].includes(e.key);
    if (back || fwd) {
      const ids = drawers[focus.k].ids.map((i) => ({ i }));
      const j = nextIndex(ids, focus.cur, fwd ? 1 : -1);
      if (j >= 0) flipTo(j);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const en = entries.find((x) => x.where === 'x' && x.k === focus.k && x.j === focus.cur);
      if (en && (!hits || hits.has(en.i))) hold(en);
      e.preventDefault();
    }
  });
  window.addEventListener('scroll', () => {
    if (held) release();
    pointer.moved = true;
    if (focus && Math.abs(window.scrollY - focus.at) > RELEASE) setFocus(null);
    invalidate();
  }, { passive: true });
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--sh3d-bar-h', `${bar.offsetHeight}px`);
  }).observe(bar);
  new ResizeObserver(() => {
    gl.resize(canvas.clientWidth, canvas.clientHeight);
    camFn = null;
    if (isNarrow() !== narrow) {
      narrow = !narrow;
      rearrange();
    }
    dirty = true;
    invalidate();
  }).observe(canvas);
  canvas.addEventListener('webglcontextrestored', () => {
    atlas.reset();
    labels.restore();
    applyColors();
    invalidate();
  });
  watchTheme(applyColors);
  document.addEventListener('langchange', () => {
    drawLabels();
    hint.reset();
    invalidate();
  });

  pressKeys();
  gl.resize(canvas.clientWidth, canvas.clientHeight);
  entries = buildEntries();
  applyColors();
  drawLabels();
  loadFonts(items).then(() => {
    fontsDone = true;
    drawLabels();
    atlas.want(wanted());
    invalidate();
  });
  const go = () => {
    ready = true;
    invalidate();
    const m = /^#tag-(.+)$/.exec(window.location.hash);
    if (!m) return;
    let name;
    try {
      name = decodeURIComponent(m[1]);
    } catch (e) {
      return;
    }
    if (mode !== 'tag') setMode('tag', false);
    const k = drawers.findIndex((d) => d.kind === 'tag' && d.key === name);
    if (k < 0) return;
    scrollToStage(1);
    setTimeout(() => setFocus({ kind: 'drawer', k, cur: 0 }), 60);
  };
  gl.warm().then(go, go);
}

start();
