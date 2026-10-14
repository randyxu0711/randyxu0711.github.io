import { readTokens, rgba, watchTheme } from 'scene3d/colors.js';
import { ease, clamp, approach } from 'scene3d/anim.js';
import { introK, introLevels, LIGHT_MIN, LIGHT_MAX } from 'scene3d/intro.js';
import {
  CARD, CAB, recent, thumb, groups, arrange, deskPose, liftPose, deskCam, cabCam, mainName, hueOf,
  drawerOut, drawerCards, focusDrawer, matches, PULL,
} from 'shares3d/layout.js';
import { createScene, quat, blend } from 'shares3d/scene.js';
import { createAtlas, createLabels, createHero, loadFonts } from 'shares3d/textures.js';
import { createHeld } from 'shares3d/held.js';
import { createHint } from 'shares3d/hint.js';

const root = document.getElementById('sh3d');
const stage = document.getElementById('sh3d-stage');
const bar = document.getElementById('sh3d-bar');
const peek = document.getElementById('sh3d-peek');
const hintEl = document.getElementById('sh3d-hint');
const qEl = document.getElementById('sh3d-q');
const found = document.getElementById('sh3d-found');
const goBtn = document.getElementById('sh3d-go');
const findBtn = document.getElementById('sh3d-find');
const list = document.getElementById('sh3d-list');
const items = JSON.parse(document.getElementById('sh3d-data').textContent);
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarse = window.matchMedia('(pointer: coarse)');
const GROUP_KEY = 'shares3d-group';
const MODES = ['tag', 'source', 'month'];
const TOKENS = ['desk', 'face', 'paper', 'paper-deep', 'edge', 'edge-n', 'edge-n-deep', 'ink', 'ink-3', 'redline', 'sticky', 'drop-near', 'unlit'];
const SEEN_KEY = 'seen-links';
const MISS = 0.6;
const SLIDE = 380;
const STAGGER = 45;
const LIFT = 4;
const TUG = 10;
const HELD_DIST = 300;
const FLAT = -Math.PI / 2;
const SWIPE = 50;
const PHOTO_IN = 450;
const TABS = 3;
const DEPTH = { desk: 0, cab: 1, drawer: 2 };
const FADE = { desk: { cab: 0.45, drawer: 0.92, held: 0.35 }, cab: { desk: 0.3, held: 0.35 }, other: 0.5, rest: 0.16 };

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
  const desk = recent(items);
  const tags = [...new Set(items.flatMap((it) => it.g))].sort();
  let drawers = groups(items, mode);
  const isNarrow = () => canvas.clientWidth / Math.max(1, canvas.clientHeight) < 1;
  let narrow = isNarrow();
  let a = arrange(desk.length, drawers.length, narrow);
  let cab = a.cab;
  let view = 'desk';
  let cur = 0;
  let slide = null;
  let dark = false;
  let raf = 0;
  let last = 0;
  let now = 0;
  let ready = false;
  let dirty = true;
  let focus = null;
  let held = null;
  let hover = null;
  let closing = null;
  let swiped = false;
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
  let fading = false;
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
      const css = kind === 'stamp' ? (dark ? `oklch(0.74 0.1 ${h})` : `oklch(0.5 0.13 ${h})`) : (dark ? `oklch(0.56 0.1 ${h})` : `oklch(0.78 0.11 ${h})`);
      tints.set(id, { css, rgb: rgba(css).slice(0, 3) });
    }
    return tints.get(id);
  }

  const atlas = createAtlas(gl, items, () => {
    dirty = true;
    invalidate();
  });
  const labels = createLabels((tex) => gl.setTextures(null, tex, null));
  gl.setTextures(atlas.texture, null, atlas.photos);
  const hero = createHero();
  let heroStale = true;
  gl.setHero(hero.mask, hero.photo);
  const card = createHeld(t);
  const hint = createHint(hintEl, t);

  function wanted() {
    const out = [...desk];
    if (focus) out.push(...drawers[focus.k].ids);
    if (closing && drawers[closing.k]) out.push(...drawers[closing.k].ids);
    if (held) out.push(held.entry.i);
    return [...new Set(out)];
  }

  function stageName() {
    return held ? 'held' : view;
  }

  function openDrawerIndex() {
    if (focus) return focus.k;
    return closing ? closing.k : -1;
  }

  function relink() {
    if (held) held.entry = entries.find((e) => e.key === held.entry.key) || held.entry;
  }

  function buildEntries() {
    const out = desk.map((i, slot) => ({ key: `d${i}`, i, where: 'd', slot }));
    const open = [...new Set([focus ? focus.k : -1, closing ? closing.k : -1])].filter((k) => k >= 0);
    open.forEach((k) => drawers[k].ids.forEach((i, j) => out.push({ key: `x${k}:${i}`, i, where: 'x', k, j })));
    return out;
  }

  function frontPose(k) {
    return { x: cab.slots[k].x, y: cab.slots[k].y, z: cab.z + fronts[k] };
  }

  function lifted(e) {
    return view === 'desk' && e.where === 'd' && e.slot === cur;
  }

  function targetOf(e) {
    const it = items[e.i];
    if (e.where === 'd') {
      if (lifted(e)) {
        const p = liftPose(e.slot, it.i, a);
        return { x: p.x, y: p.y, z: p.z, q: quat(p.rx, p.ry) };
      }
      const p = deskPose(e.slot, it.i, a);
      const lift = hover && hover.key === e.key ? LIFT : 0;
      return { x: p.x, y: p.y + lift, z: p.z, q: quat(FLAT, p.ry) };
    }
    const f = frontPose(e.k);
    const at = focus && focus.k === e.k ? focus.cur : 0;
    const local = drawerCards(drawers[e.k].ids.length, at)[e.j];
    return { x: f.x, y: f.y + local.y, z: f.z + local.z, q: quat(local.rx, 0) };
  }

  function fadeOf(e, matchFade) {
    if (held && held.entry.key === e.key) return 0;
    let base = e.where === 'x' ? fades.drawers[e.k] || 0 : fades.desk;
    if (e.where === 'd' && view === 'desk' && !held && e.slot !== cur) base = Math.max(base, FADE.rest);
    return Math.max(base, matchFade);
  }

  function photoOf(i) {
    const at = atlas.photo(i);
    if (!at) return 0;
    if (reduce.matches) return 1;
    const k = clamp((now - at) / PHOTO_IN, 0, 1);
    if (k < 1) fading = true;
    return ease(k);
  }

  function heroOf(e) {
    if (!lifted(e) || !fontsDone) return 0;
    const img = atlas.image(e.i);
    if (heroStale || hero.item() !== e.i || (img && !hero.hasPhoto())) {
      hero.draw(e.i, items[e.i], img);
      heroStale = false;
    }
    return hero.hasPhoto() ? 2 : 1;
  }

  function cardItem(e, pose) {
    const it = items[e.i];
    return {
      x: pose.x, y: pose.y, z: pose.z, q: pose.q, s: pose.s,
      tile: atlas.tile(e.i),
      photo: photoOf(e.i),
      photoTile: atlas.photoTile(e.i),
      hero: heroOf(e),
      stamp: it.x && tokens ? tokens.redline.slice(0, 3) : tint('stamp', mainName(it.s)).rgb,
      tabs: it.g.slice(0, TABS).map((g) => ({ color: tint('tab', g).rgb, tile: labels.tagTile(tags.indexOf(g)) })),
      sticky: !!it.n,
      fade: fadeOf(e, hits && !hits.has(e.i) ? MISS : 0),
      hot: lifted(e) && !held ? 1 : 0,
      hidden: held && held.entry.key === e.key && held.phase === 'dom',
    };
  }

  function shadowList() {
    const out = desk.map((i, slot) => {
      const p = deskPose(slot, items[i].i, a);
      const gone = held && held.entry.key === `d${i}`;
      return { x: p.x, z: p.z, ry: p.ry, w: CARD.W, h: CARD.H, fade: gone ? 1 : Math.max(fades.desk, view === 'desk' && slot === cur ? 0.45 : 0) };
    });
    out.push({ x: 0, z: cab.z - cab.depth / 2 + 12, ry: 0, w: cab.width, h: cab.depth + 24, fade: fades.cab });
    return out;
  }

  function drawerColor(d) {
    return d.kind === 'tag' || d.kind === 'source' ? tint('tab', d.key).rgb : null;
  }

  function drawerList(t0) {
    return drawers.map((d, k) => {
      let dz = 0;
      if (slide !== null) dz = -(CAB.DEPTH - 20) * (1 - ease(clamp((t0 - slide - k * STAGGER) / SLIDE, 0, 1)));
      const empty = hits && !d.ids.some((i) => hits.has(i));
      return {
        x: cab.slots[k].x, y: cab.slots[k].y, z: cab.z + fronts[k] + dz, tile: labels.drawerTile(k), color: drawerColor(d),
        fade: Math.max(fades.drawers[k] || 0, empty ? 0.5 : 0),
        hot: hover && hover.kind === 'drawer' && hover.k === k && !(focus && focus.k === k) ? 1 : 0,
      };
    });
  }

  function drawLabels() {
    labels.draw(
      drawers.map((d) => ({ name: drawerName(d), count: t('shares3d.cards', hits ? `${d.ids.filter((i) => hits.has(i)).length} / ${d.ids.length}` : d.ids.length) })),
      tags,
    );
    dirty = true;
  }

  function camTarget(aspect) {
    if (focus) return focusDrawer(drawerOut(cab, focus.k), aspect, a);
    if (view === 'cab') return cabCam(aspect, a);
    return deskCam(liftPose(cur, items[desk[cur]].i, a), aspect, a);
  }

  function lampTarget(s) {
    if (s === 'held' && held && held.pose) {
      const h = held.pose;
      return { pos: [cam.pos[0] + (h.x - cam.pos[0]) * 0.4, cam.pos[1] + (h.y - cam.pos[1]) * 0.4 + 60, cam.pos[2] + (h.z - cam.pos[2]) * 0.4], reach: 260 };
    }
    if (focus) {
      const f = frontPose(focus.k);
      return { pos: [f.x, f.y + 170, f.z + 40], reach: 300 };
    }
    if (view === 'cab') return { pos: [0, cab.height + 120, cab.z + 260], reach: 520 };
    const p = liftPose(cur, items[desk[cur]].i, a);
    return { pos: [p.x, p.y + 220, p.z + 130], reach: 360 };
  }

  function siblings(e) {
    if (e.where === 'd') return desk.map((i) => entries.find((x) => x.key === `d${i}`));
    return drawers[e.k].ids.map((i, j) => entries.find((x) => x.where === 'x' && x.k === e.k && x.j === j));
  }

  function itemFor(e) {
    const it = items[e.i];
    const here = e.where === 'x' && mode === 'tag' ? drawers[e.k].key : null;
    return {
      t: it.t, s: it.s, d: it.d, g: it.g, n: it.n, e: it.e, u: it.u, x: it.x, i: it.i,
      m: thumb(it.m), m0: it.m,
      stamp: it.x ? 'var(--redline)' : tint('stamp', mainName(it.s)).css,
      tabs: it.g.slice(0, TABS).map((g) => ({ name: g, css: tint('tab', g).css })),
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

  function nextIndex(arr, from, dir) {
    for (let j = from + dir; j >= 0 && j < arr.length; j += dir) {
      if (arr[j] && (!hits || hits.has(arr[j].i))) return j;
    }
    return -1;
  }

  function step(dir) {
    if (!held || held.phase !== 'dom' || card.busy()) return;
    const sibs = siblings(held.entry);
    const j = nextIndex(sibs, sibs.indexOf(held.entry), dir);
    if (j < 0) {
      card.bump(dir);
      return;
    }
    const prev = held.entry;
    poses.set(prev.key, targetOf(prev));
    held.entry = sibs[j];
    if (held.pose) poses.set(held.entry.key, held.pose);
    if (focus && held.entry.where === 'x') focus.cur = held.entry.j;
    if (held.entry.where === 'd') cur = held.entry.slot;
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
      heroStale = true;
      dirty = true;
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
    if (focus && (!f || f.k !== focus.k)) closing = { k: focus.k };
    focus = f ? Object.assign({}, f) : null;
    if (focus && closing && closing.k === focus.k) closing = null;
    pointer.moved = true;
    peek.hidden = true;
    hover = null;
    atlas.want(wanted());
    entries = buildEntries();
    relink();
    dirty = true;
    invalidate();
  }

  function show(v, k = -1, at = 0) {
    if (v === 'drawer' && !drawers[k]) v = 'cab';
    if (v === 'drawer') setFocus({ k, cur: clamp(at, 0, drawers[k].ids.length - 1) });
    else if (focus) setFocus(null);
    view = v;
    entries = buildEntries();
    relink();
    syncGo();
    pointer.moved = true;
    dirty = true;
    invalidate();
  }

  function urlFor(v, k) {
    const base = window.location.pathname + window.location.search;
    if (v === 'drawer' && drawers[k] && drawers[k].kind === 'tag') return `${base}#tag-${encodeURIComponent(drawers[k].key)}`;
    return base;
  }

  function remember(v, k, push) {
    const st = window.history.state;
    const back = push ? true : !!(st && st.sh3d && st.back);
    const d = v === 'drawer' ? drawers[k] : null;
    const next = { sh3d: v, back, mode, key: d ? d.key : null, part: d ? d.part : 0 };
    try {
      if (push) window.history.pushState(next, '', urlFor(v, k));
      else window.history.replaceState(next, '', urlFor(v, k));
    } catch (e) {}
  }

  function enter(v, k = -1, at = 0) {
    release();
    const deeper = DEPTH[v] > DEPTH[view];
    show(v, k, at);
    remember(view, focus ? focus.k : -1, deeper);
  }

  function back() {
    release();
    if (view === 'desk') return;
    const st = window.history.state;
    if (st && st.sh3d === view && st.back) {
      window.history.back();
      return;
    }
    show(view === 'drawer' ? 'cab' : 'desk');
    remember(view, -1, false);
  }

  function setCur(k) {
    const n = desk.length;
    const next = ((k % n) + n) % n;
    if (next === cur) return;
    cur = next;
    peek.hidden = true;
    dirty = true;
    invalidate();
  }

  function stepDesk(dir) {
    for (let k = 1; k <= desk.length; k++) {
      const j = (((cur + dir * k) % desk.length) + desk.length) % desk.length;
      if (!hits || hits.has(desk[j])) {
        setCur(j);
        return;
      }
    }
  }

  function flipTo(j) {
    if (!focus) return;
    const n = drawers[focus.k].ids.length;
    const next = clamp(j, 0, n - 1);
    if (next === focus.cur) return;
    focus.cur = next;
    showPeek(entries.find((e) => e.where === 'x' && e.k === focus.k && e.j === next));
    dirty = true;
    invalidate();
  }

  function flipBy(dir) {
    if (!focus) return;
    const ids = drawers[focus.k].ids.map((i) => ({ i }));
    const j = nextIndex(ids, focus.cur, dir);
    if (j >= 0) flipTo(j);
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

  function syncGo() {
    goBtn.textContent = view === 'desk' ? `↑ ${t('shares3d.to_cab')}` : view === 'cab' ? `↓ ${t('shares3d.to_desk')}` : t('shares3d.hint.close_drawer');
  }

  function resolve(hit) {
    if (!hit) return null;
    if (hit.kind === 'drawer') return { kind: 'drawer', k: hit.index };
    const e = entries[hit.index];
    if (!e || (e.where === 'x' && !(focus && focus.k === e.k))) return null;
    return { kind: 'card', key: e.key, entry: e };
  }

  function interact(hit) {
    if (held) {
      release();
      return;
    }
    if (!hit) {
      if (view === 'drawer') back();
      return;
    }
    if (hit.kind === 'drawer') {
      if (view === 'desk') enter('cab');
      else if (focus && focus.k === hit.k) back();
      else if (focus) {
        show('drawer', hit.k, 0);
        remember('drawer', hit.k, false);
      } else enter('drawer', hit.k, 0);
      return;
    }
    const e = hit.entry;
    if (e.where === 'd') {
      if (view === 'cab') {
        cur = e.slot;
        back();
      } else if (view === 'desk') {
        if (e.slot !== cur) setCur(e.slot);
        else hold(e);
      }
      return;
    }
    if (focus && e.k === focus.k && e.j !== focus.cur) {
      flipTo(e.j);
      return;
    }
    hold(e);
  }

  function frame(t0) {
    raf = 0;
    now = t0;
    const dt = last ? Math.min(0.05, (t0 - last) / 1000) : 1 / 60;
    last = t0;
    fading = false;
    let busy = atlas.pump() || atlas.pending();
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const s = stageName();
    const k = reduce.matches ? 1 : 1 - Math.exp(-dt * 10);
    const kf = reduce.matches ? 1 : 1 - Math.exp(-dt * 4);

    if (pointer.moved && !held && !coarse.matches && lit) {
      pointer.moved = false;
      const h = pointer.on ? resolve(gl.pick(pointer.x, pointer.y)) : null;
      const before = hover ? hover.key || `k${hover.k}` : '';
      hover = h && (h.kind === 'drawer' || h.entry.where !== 'x') && !(h.kind === 'card' && lifted(h.entry)) ? h : null;
      if (h && h.kind === 'card' && h.entry.where === 'x' && focus && h.entry.k === focus.k && (!hits || hits.has(h.entry.i))) flipTo(h.entry.j);
      const after = hover ? hover.key || `k${hover.k}` : '';
      if (before !== after) dirty = true;
      stage.style.cursor = h ? 'pointer' : '';
      if (hover && hover.kind === 'card') showPeek(hover.entry);
      else if (!focus) peek.hidden = true;
    }

    const target = camTarget(aspect);
    if (!cam.pos || reduce.matches) {
      cam.pos = target.pos.slice();
      cam.look = target.look.slice();
    } else {
      for (let q = 0; q < 3; q++) {
        cam.pos[q] = approach(cam.pos[q], target.pos[q], dt, 6);
        cam.look[q] = approach(cam.look[q], target.look[q], dt, 6);
      }
    }
    if (gap(cam.pos, target.pos) + gap(cam.look, target.look) > 0.1) busy = true;

    const wantDesk = FADE.desk[s] || 0;
    const wantCab = FADE.cab[s] || 0;
    if (Math.abs(fades.desk - wantDesk) > 0.002) { fades.desk += (wantDesk - fades.desk) * kf; busy = true; dirty = true; }
    if (Math.abs(fades.cab - wantCab) > 0.002) { fades.cab += (wantCab - fades.cab) * kf; busy = true; dirty = true; }
    drawers.forEach((d, i) => {
      const w = focus && focus.k !== i ? FADE.other : wantCab;
      const was = fades.drawers[i] || 0;
      if (Math.abs(was - w) > 0.002) { fades.drawers[i] = was + (w - was) * kf; busy = true; dirty = true; }
      const out = focus && focus.k === i ? PULL : hover && hover.kind === 'drawer' && hover.k === i ? TUG : 0;
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

    const out = [];
    entries.forEach((e) => {
      const goal = held && held.entry.key === e.key && held.pose ? held.pose : targetOf(e);
      let pose = poses.get(e.key);
      if (!pose) pose = goal;
      else if (moved(pose, goal) > 0.01) {
        pose = blend(pose, goal, k);
        busy = true;
        dirty = true;
      } else if (pose !== goal) {
        pose = goal;
        dirty = true;
      }
      poses.set(e.key, pose);
      out.push(cardItem(e, pose));
      if (held && held.entry.key === e.key && held.phase === 'fly' && moved(pose, goal) < 0.05) {
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
    if (fading) {
      busy = true;
      dirty = true;
    }

    if (slide !== null) {
      if (t0 - slide > SLIDE + STAGGER * drawers.length) slide = null;
      busy = true;
      dirty = true;
    }

    if (dirty) {
      gl.setCards(out);
      gl.setDrawers(drawerList(t0));
      gl.setShadows(shadowList());
      gl.setCabinet(cab, fades.cab);
      const ok = openDrawerIndex();
      gl.setTray(ok >= 0 ? Object.assign(frontPose(ok), { fade: fades.drawers[ok] || 0 }) : null);
      dirty = false;
    }

    const lt = lampTarget(s);
    if (!lamp.pos || reduce.matches) lamp.pos = lt.pos.slice();
    else {
      for (let q = 0; q < 3; q++) lamp.pos[q] = approach(lamp.pos[q], lt.pos[q], dt, 6);
      if (gap(lamp.pos, lt.pos) > 0.5 && dark) busy = true;
    }
    gl.setLamp(dark && lit, lamp.pos[0], lamp.pos[1], lamp.pos[2], lt.reach);
    if (intro && liveT0 && stepLight(t0)) busy = true;

    bar.classList.toggle('at-cab', s === 'cab' || s === 'drawer');
    const count = s === 'drawer' ? `${focus.cur + 1} / ${drawers[focus.k].ids.length}` : s === 'desk' ? `${cur + 1} / ${desk.length}` : s === 'held' ? (() => {
      const sibs = siblings(held.entry);
      return `${sibs.indexOf(held.entry) + 1} / ${sibs.length}`;
    })() : '';
    hint.set(s, count, coarse.matches);

    gl.render(cam);
    if (!liveT0) {
      liveT0 = t0;
      root.classList.add('live');
      if (intro) busy = true;
      else switchOn(t0);
    }
    if (busy) invalidate();
    else last = 0;
  }

  function invalidate() {
    if (!raf && ready) raf = requestAnimationFrame(frame);
  }

  function deskReady() {
    return fontsDone && desk.every((i) => atlas.tile(i));
  }

  function switchOn(t0) {
    litT0 = t0;
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

  function stepLight(t0) {
    if (!lit) {
      const el = t0 - liveT0;
      if (quick === null && el >= LIGHT_MIN) quick = deskReady();
      if (el >= LIGHT_MAX || (el >= LIGHT_MIN && deskReady())) switchOn(t0);
    }
    applyIntro(lit ? t0 - litT0 : -1);
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
      card.recolor(it.stamp, it.tabs);
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
    if (hits && focus) {
      const ids = drawers[focus.k].ids;
      if (!hits.has(ids[focus.cur])) {
        const j = ids.findIndex((i) => hits.has(i));
        if (j >= 0) focus.cur = j;
      }
    }
    if (hits && !hits.has(desk[cur])) {
      const j = desk.findIndex((i) => hits.has(i));
      if (j >= 0) cur = j;
    }
    drawLabels();
    dirty = true;
    invalidate();
  }

  function reveal(i) {
    release();
    const d = desk.indexOf(i);
    if (d >= 0) {
      cur = d;
      show('desk');
      remember('desk', -1, false);
      return entries.find((e) => e.key === `d${i}`);
    }
    const k = drawers.findIndex((dr) => dr.ids.includes(i));
    if (k < 0) return null;
    show('drawer', k, drawers[k].ids.indexOf(i));
    remember('drawer', k, false);
    return entries.find((e) => e.where === 'x' && e.k === k && e.i === i);
  }

  function pressKeys() {
    bar.querySelectorAll('[data-group-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.groupSet === mode)));
  }

  function setMode(m, keep = true, nav = true) {
    if (m === mode || !MODES.includes(m)) return;
    mode = m;
    if (keep) {
      try { localStorage.setItem(GROUP_KEY, m); } catch (e) {}
    }
    pressKeys();
    release();
    const wasDrawer = view === 'drawer';
    if (focus) setFocus(null);
    closing = null;
    drawers = groups(items, mode);
    slide = reduce.matches ? null : performance.now();
    rearrange();
    if (wasDrawer) {
      view = 'cab';
      syncGo();
      const st = window.history.state;
      if (nav && st && st.sh3d === 'drawer' && st.back) window.history.back();
      else if (nav) remember('cab', -1, false);
    }
    invalidate();
  }

  function rearrange() {
    a = arrange(desk.length, drawers.length, narrow);
    cab = a.cab;
    fronts.length = 0;
    drawers.forEach(() => fronts.push(0));
    fades.drawers = drawers.map(() => fades.cab);
    entries = buildEntries();
    relink();
    drawLabels();
    dirty = true;
  }

  function onScreen() {
    return stage.getBoundingClientRect().bottom > window.innerHeight * 0.5;
  }

  bar.querySelectorAll('[data-group-set]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.groupSet)));
  goBtn.addEventListener('click', () => {
    if (!lit) return;
    if (view === 'desk') enter('cab');
    else back();
  });
  qEl.addEventListener('input', () => setQuery(qEl.value));
  qEl.addEventListener('blur', () => { if (!qEl.value) qEl.classList.remove('open'); });
  findBtn.addEventListener('click', () => {
    qEl.classList.add('open');
    qEl.focus();
  });
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
    hover = en && en.where !== 'x' && !lifted(en) ? { kind: 'card', key: en.key, entry: en } : null;
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
  let down = null;
  stage.addEventListener('pointerdown', (e) => {
    swiped = false;
    down = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY };
  });
  stage.addEventListener('pointercancel', () => { down = null; });
  stage.addEventListener('pointerup', (e) => {
    if (!down || !lit || held) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swiped = true;
    if (view === 'desk') stepDesk(dx < 0 ? 1 : -1);
    else if (view === 'drawer') flipBy(dx < 0 ? 1 : -1);
  });
  stage.addEventListener('click', (e) => {
    if (swiped) {
      swiped = false;
      return;
    }
    if (!lit || e.detail > 1 || (held && held.phase !== 'dom')) return;
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
    if (!lit || !onScreen()) return;
    if (e.key === '/') {
      qEl.classList.add('open');
      qEl.focus();
      e.preventDefault();
      return;
    }
    const key = e.key;
    if (view === 'desk') {
      if (key === 'ArrowLeft' || key === 'ArrowRight') stepDesk(key === 'ArrowRight' ? 1 : -1);
      else if (key === 'ArrowUp') enter('cab');
      else if (key === 'Enter' && document.activeElement === document.body) {
        const en = entries.find((x) => x.key === `d${desk[cur]}`);
        if (en && (!hits || hits.has(en.i))) hold(en);
      } else return;
    } else if (view === 'cab') {
      if (key === 'ArrowDown' || key === 'Escape') back();
      else return;
    } else {
      const fwd = ['ArrowRight', 'j'].includes(key);
      const bwd = ['ArrowLeft', 'k'].includes(key);
      if (fwd || bwd) flipBy(fwd ? 1 : -1);
      else if (key === 'ArrowDown') back();
      else if (key === 'Enter') {
        const en = entries.find((x) => x.where === 'x' && x.k === focus.k && x.j === focus.cur);
        if (en && (!hits || hits.has(en.i))) hold(en);
      } else if (key === 'Escape') back();
      else return;
    }
    e.preventDefault();
  });
  window.addEventListener('popstate', (e) => {
    const st = e.state;
    release();
    if (!st || !st.sh3d) {
      show('desk');
      return;
    }
    if (st.sh3d !== 'drawer') {
      show(st.sh3d);
      return;
    }
    if (st.mode !== mode && MODES.includes(st.mode)) setMode(st.mode, false, false);
    const k = drawers.findIndex((d) => d.key === st.key && d.part === st.part);
    show(k >= 0 ? 'drawer' : 'cab', k, 0);
  });
  window.addEventListener('scroll', () => {
    if (held) release();
    pointer.moved = true;
    invalidate();
  }, { passive: true });
  new ResizeObserver(() => {
    gl.resize(canvas.clientWidth, canvas.clientHeight);
    if (isNarrow() !== narrow) {
      narrow = !narrow;
      rearrange();
    }
    dirty = true;
    invalidate();
  }).observe(canvas);
  canvas.addEventListener('webglcontextrestored', () => {
    atlas.reset();
    hero.restore();
    labels.restore();
    applyColors();
    invalidate();
  });
  watchTheme(applyColors);
  document.addEventListener('langchange', () => {
    drawLabels();
    hint.reset();
    syncGo();
    invalidate();
  });

  pressKeys();
  syncGo();
  gl.resize(canvas.clientWidth, canvas.clientHeight);
  entries = buildEntries();
  applyColors();
  drawLabels();
  atlas.want(wanted());
  loadFonts(items).then(() => {
    fontsDone = true;
    heroStale = true;
    drawLabels();
    atlas.refresh(wanted());
    invalidate();
  });
  const go = () => {
    ready = true;
    const m = /^#tag-(.+)$/.exec(window.location.hash);
    let name = null;
    if (m) {
      try {
        name = decodeURIComponent(m[1]);
      } catch (e) {}
    }
    if (name !== null) {
      if (mode !== 'tag') setMode('tag', false);
      const k = drawers.findIndex((d) => d.kind === 'tag' && d.key === name);
      if (k >= 0) show('drawer', k, 0);
    }
    remember(view, focus ? focus.k : -1, false);
    invalidate();
  };
  gl.warm().then(go, go);
}

start();
