import { layout, viewSpan, inView, countryRun, thickness, height, W, PAD, GAP, LIP, SORT_NAMES } from 'books3d/layout.js';
import { readTokens, hexRgb, watchTheme } from 'scene3d/colors.js';
import { createScene, SHELF_FRONT } from 'books3d/scene.js';
import { globeSpot } from 'books3d/geo.js';
import { createTextures, loadFonts, drawBack, bigCover, titleOf, authorOf, lang } from 'books3d/textures.js';
import { ease, easeInOut, lerp, clamp, approach } from 'scene3d/anim.js';
import { introK, introLevels, LIGHT_MIN, LIGHT_MAX } from 'scene3d/intro.js';

const root = document.getElementById('b3d');
const stage = document.getElementById('b3d-scene');
const bar = document.getElementById('b3d-bar');
const viewKey = document.getElementById('b3d-view');
const sortKey = document.getElementById('b3d-sort');
const tier = document.getElementById('b3d-tier');
const arrows = document.getElementById('b3d-arrows');
const rail = document.getElementById('b3d-rail');
const track = rail.querySelector('.b3d-rail-track');
const tip = rail.querySelector('.b3d-rail-tip');
const heldEl = document.getElementById('b3d-held');
const heldText = document.getElementById('b3d-held-text');
const grLink = document.getElementById('b3d-gr');
const list = document.getElementById('b3d-list');
const globeKey = document.getElementById('b3d-globe-key');
const mapKey = document.getElementById('b3d-map-key');
const books = JSON.parse(document.getElementById('b3d-data').textContent);
const geoEl = document.getElementById('b3d-geo');
const geo = geoEl ? JSON.parse(geoEl.textContent) : {};
const subregions = new Map((geo.subregions || []).map((s) => [s.id, s]));
books.forEach((b) => {
  const c = geo.countries && b.g ? geo.countries[b.g] : null;
  const s = c ? subregions.get(c.subregion) : null;
  b.cn = c ? { zh: c.zh, en: c.en } : null;
  b.sr = s ? s.id : null;
  b.ct = s ? s.continent || c.continent || null : null;
});
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const n = books.length;
const VIEW_KEY = 'books3d-view';
const SORT_KEY = 'books3d-sort';
const TOKENS = ['desk', 'oak', 'paper', 'paper-deep', 'edge', 'drop-near', 'unlit', 'ink', 'lamp'];
const SHUFFLE = 1600;
const FADE = 0.3;
const STAGGER = 400;
const TURN = 600;
const SLIDE_OUT = 14;
const FLY = 620;
const FLIP = 520;
const LEAN = (7 * Math.PI) / 180;
const STAR = '<svg class="%" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.6l2.55 5.4 5.9.72-4.35 4.06 1.12 5.86L10 14.76l-5.22 2.88 1.12-5.86L1.55 7.72l5.9-.72z"/></svg>';
const CHEVRON = {
  prev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const dims = books.map((b) => ({ t: thickness(b), h: height(b), color: hexRgb(b.c), ink: hexRgb(b.k || '#f7f3ea') }));

const t = (k, num) => (window.siteI18n ? window.siteI18n.t(k, num) : k);
const regionName = (id) => {
  const s = subregions.get(id);
  return s ? s[lang()] || s.en : id;
};
const rotOf = (view) => (view === 'covers' ? -Math.PI / 2 : 0);
const zOf = (view, i) => (view === 'covers' ? -dims[i].t / 2 : -W / 2);
const footprint = (i, rot) => dims[i].t * Math.abs(Math.cos(rot)) + W * Math.abs(Math.sin(rot));

async function start() {
  let gl;
  try {
    gl = createScene(books, dims);
  } catch (e) {
    root.classList.add('fail');
    return;
  }
  const canvas = gl.canvas;
  canvas.className = 'b3d-canvas s3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  root.appendChild(canvas);
  root.classList.add('on');
  stage.hidden = false;

  let stored = [null, null];
  try { stored = [localStorage.getItem(VIEW_KEY), localStorage.getItem(SORT_KEY)]; } catch (e) {}
  const state = {
    view: stored[0] === 'spines' ? 'spines' : 'covers',
    sort: SORT_NAMES.includes(stored[1]) ? stored[1] : 'rating',
    L: null,
  };
  const off = new Map();
  const offT = new Map();
  const cam = { cx: 0, yTop: 0, span: 1 };
  const P = new Float32Array(n * 4);
  const hv = new Float32Array(n);
  const hvT = new Float32Array(n);
  const ln = new Float32Array(n);
  const lnV = new Float32Array(n);
  const lnT = new Float32Array(n);
  const br = new Float32Array(n);
  const brV = new Float32Array(n);
  let held = null;
  let dim = 0;
  let m = null;
  let trans = null;
  let shelfPose = [];
  let dirty = true;
  let drag = null;
  let tex = null;

  function metrics() {
    const vw = canvas.clientWidth;
    const sp = viewSpan(state.view, vw, window.innerHeight);
    const ppu = vw / sp;
    return { vw, span: sp, ppu, gutter: 16 / ppu, head: (tier.offsetHeight + 24) / ppu + 12 };
  }

  const offsetOf = (s) => clamp(off.get(s.key) || 0, s.minOffset, 0);
  const homeX = (L, i) => {
    const it = L.items[i];
    const s = L.shelves[it.shelf];
    return s.x0 + offsetOf(s) + it.lx;
  };

  function home() {
    const L = state.L;
    for (let i = 0; i < n; i++) {
      P[i * 4] = homeX(L, i);
      P[i * 4 + 1] = L.shelves[L.items[i].shelf].y;
      P[i * 4 + 2] = zOf(state.view, i);
      P[i * 4 + 3] = rotOf(state.view);
    }
    shelfPose = L.shelves.map((s) => ({ x: s.x0 + offsetOf(s), y: s.y, length: s.length }));
  }

  function scrollTarget() {
    return stage.getBoundingClientRect().top / m.ppu;
  }

  function anchorBook() {
    const cy = scrollTarget() - window.innerHeight / 2 / m.ppu;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(P[i * 4] - cam.cx) + 2 * Math.abs(P[i * 4 + 1] + dims[i].h / 2 - cy);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function relayout(animate) {
    const oldL = state.L;
    const from = P.slice();
    const anchor = oldL ? anchorBook() : -1;
    const anchorY = oldL ? (scrollTarget() - (P[anchor * 4 + 1] + dims[anchor].h / 2)) * m.ppu : 0;
    const oldSpan = m ? m.span : 1;
    const camFrom = Object.assign({}, cam);
    const shelvesFrom = shelfPose;
    m = metrics();
    cam.span = m.span;
    const L = layout(books, { view: state.view, sort: state.sort, width: m.span, gutter: m.gutter, head: m.head });
    state.L = L;
    gl.setCorner(globeSpot(m.span, m.vw, window.innerHeight).corner);
    stage.style.height = Math.ceil(L.height * m.ppu) + 'px';

    const pivots = L.shelves.map((s) => {
      if (!oldL) return null;
      const centre = !!animate && s.list.includes(anchor);
      let p = 0;
      let bd = Infinity;
      s.list.forEach((i, j) => {
        const d = centre ? (i === anchor ? 0 : 1) : Math.abs(from[i * 4] - cam.cx);
        if (d < bd) { bd = d; p = j; }
      });
      const i = s.list[p];
      const atStart = (off.get(s.key) || 0) > -0.5;
      const want = centre ? cam.cx : from[i * 4] * m.span / oldSpan;
      const o = !centre && atStart ? 0 : clamp(want - s.x0 - L.items[i].lx, s.minOffset, 0);
      off.set(s.key, o);
      offT.set(s.key, o);
      return p;
    });

    if (oldL) {
      const yc = L.shelves[L.items[anchor].shelf].y + dims[anchor].h / 2;
      const docTop = stage.getBoundingClientRect().top + window.scrollY;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = clamp(Math.round(docTop - yc * m.ppu - anchorY), 0, max);
      if (Math.abs(y - window.scrollY) > 1) window.scrollTo(0, y);
    }

    if (animate === 'turn' && oldL && !reduce.matches) planSwitch(oldL, L, from, pivots, camFrom);
    else if (animate === 'shuffle' && oldL && !reduce.matches) planShuffle(oldL, L, from, camFrom, shelvesFrom);
    else {
      trans = null;
      home();
    }
    buildArrows();
    buildRail();
    dirty = true;
  }

  function planSwitch(oldL, L, from, pivots, camFrom) {
    const left = camFrom.cx - camFrom.span / 2;
    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    const hvOf = (sp) => sp * vh / vw;
    const cyFrom = camFrom.yTop - hvOf(camFrom.span) / 2;
    const delay = new Float32Array(n);
    for (let i = 0; i < n; i++) delay[i] = clamp((from[i * 4] - left) / camFrom.span, 0, 1) * STAGGER;
    const rotTo = rotOf(state.view);
    const plans = L.shelves.map((s, k) => {
      const old = oldL.shelves.find((o) => o.key === s.key);
      const same = old && old.list.length === s.list.length && old.list.every((v, j) => v === s.list[j]);
      if (!same || pivots[k] === null) return null;
      const pi = s.list[pivots[k]];
      return { s, p: pivots[k], fromX: from[pi * 4], toX: homeX(L, pi) };
    });
    const t0 = performance.now();
    shelfPose = L.shelves.map((s) => ({ x: s.x0 + offsetOf(s), y: s.y, length: s.length }));
    const prog = (i, el) => ease(clamp((el - delay[i]) / TURN, 0, 1));
    trans = {
      camera(now) {
        const e = easeInOut(clamp((now - t0) / (STAGGER + TURN), 0, 1));
        const sp = Math.exp(lerp(Math.log(camFrom.span), Math.log(m.span), e));
        const cy = lerp(cyFrom, scrollTarget() - hvOf(m.span) / 2, e);
        return { cx: lerp(camFrom.cx, 0, e), yTop: cy + hvOf(sp) / 2, span: sp };
      },
      step(now) {
        const el = now - t0;
        for (let i = 0; i < n; i++) {
          const e = prog(i, el);
          P[i * 4] = lerp(from[i * 4], homeX(L, i), e);
          P[i * 4 + 1] = lerp(from[i * 4 + 1], L.shelves[L.items[i].shelf].y, e);
          P[i * 4 + 2] = lerp(from[i * 4 + 2], zOf(state.view, i), e);
          P[i * 4 + 3] = lerp(from[i * 4 + 3], rotTo, e);
        }
        plans.forEach((pl, k) => {
          if (!pl) return;
          const list = pl.s.list;
          const cum = new Float32Array(list.length);
          let x = PAD;
          list.forEach((i, j) => {
            const w = footprint(i, P[i * 4 + 3]);
            cum[j] = x + w / 2;
            x += w + GAP;
          });
          const base = lerp(pl.fromX, pl.toX, prog(list[pl.p], el)) - cum[pl.p];
          list.forEach((i, j) => { P[i * 4] = base + cum[j]; });
          shelfPose[k] = { x: base, y: pl.s.y, length: Math.max(pl.s.avail, x - GAP + PAD) };
        });
        if (el >= STAGGER + TURN) {
          trans = null;
          home();
        }
      },
    };
  }

  function planShuffle(oldL, L, from, camFrom, shelvesFrom) {
    const vw = canvas.clientWidth;
    const vh = canvas.clientHeight;
    const hvOf = (sp) => sp * vh / vw;
    const wallH = Math.max(oldL.height, L.height);
    const spanW = clamp(wallH * vw / vh * 1.05, m.span * 1.6, m.span * 5);
    const hvW = hvOf(spanW);
    const cyFrom = camFrom.yTop - hvOf(camFrom.span) / 2;
    const centerTo = () => scrollTarget() - hvOf(m.span) / 2;
    const cyW = hvW >= wallH ? -wallH / 2 : clamp((cyFrom + centerTo()) / 2, -wallH + hvW / 2, -hvW / 2);
    const cxW = L.grouped ? (spanW - m.span) / 2 : 0;
    const frame = (a, b, e) => {
      const sp = Math.exp(lerp(Math.log(a.span), Math.log(b.span), e));
      return { cx: lerp(a.cx, b.cx, e), yTop: lerp(a.cy, b.cy, e) + hvOf(sp) / 2, span: sp };
    };
    const A = { cx: camFrom.cx, cy: cyFrom, span: camFrom.span };
    const Wd = { cx: cxW, cy: cyW, span: spanW };

    const dist = new Float32Array(n);
    let dmax = 1;
    for (let i = 0; i < n; i++) {
      dist[i] = Math.hypot(homeX(L, i) - from[i * 4], L.shelves[L.items[i].shelf].y - from[i * 4 + 1]);
      dmax = Math.max(dmax, dist[i]);
    }
    const rotTo = rotOf(state.view);
    const t0 = performance.now();
    const newShelves = L.shelves.map((s) => ({ x: s.x0 + offsetOf(s), y: s.y, length: s.length }));
    shelfPose = shelvesFrom;
    trans = {
      camera(now) {
        const p = (now - t0) / SHUFFLE;
        if (p < 0.35) return frame(A, Wd, easeInOut(p / 0.35));
        if (p < 0.65) return frame(Wd, Wd, 0);
        return frame(Wd, { cx: 0, cy: centerTo(), span: m.span }, easeInOut(clamp((p - 0.65) / 0.35, 0, 1)));
      },
      step(now) {
        const el = now - t0;
        if (el >= SHUFFLE * 0.5) shelfPose = newShelves;
        for (let i = 0; i < n; i++) {
          const k = dist[i] / dmax;
          const e = easeInOut(clamp((el - SHUFFLE * (0.1 + 0.2 * (1 - k))) / (SHUFFLE * 0.5), 0, 1));
          const arc = Math.sin(Math.PI * e);
          P[i * 4] = lerp(from[i * 4], homeX(L, i), e);
          P[i * 4 + 1] = lerp(from[i * 4 + 1], L.shelves[L.items[i].shelf].y, e) + Math.min(dist[i] * 0.3, 700) * arc;
          P[i * 4 + 2] = lerp(from[i * 4 + 2], zOf(state.view, i), e) + Math.min(dist[i] * 0.2, 400) * arc;
          P[i * 4 + 3] = lerp(from[i * 4 + 3], rotTo, e);
        }
        if (el >= SHUFFLE) {
          trans = null;
          home();
        }
      },
    };
  }

  const pose = { x: 0, y: 0, z: 0, rot: 0, sx: 1, sy: 1, sz: W, brush: 0, front: 0, lean: 0, pivot: 0 };
  function bookPose(i, out) {
    const d = dims[i];
    const rot = P[i * 4 + 3];
    out.x = P[i * 4];
    out.y = P[i * 4 + 1];
    out.z = P[i * 4 + 2] + hv[i] * SLIDE_OUT;
    out.rot = rot;
    out.sx = d.t;
    out.sy = d.h;
    out.sz = W;
    out.brush = br[i];
    out.front = out.z + (d.t * Math.abs(Math.sin(rot)) + W * Math.abs(Math.cos(rot))) / 2;
    out.lean = ln[i];
    out.pivot = out.x + (ln[i] > 0 ? -1 : 1) * footprint(i, rot) / 2;
    return out;
  }

  function writeBooks() {
    for (let i = 0; i < n; i++) {
      bookPose(i, pose);
      if (held && held.i === i) pose.sx = pose.sy = pose.sz = 1e-5;
      gl.setBook(i, pose);
      gl.setState(i, 1, hv[i]);
    }
    gl.booksChanged();
    gl.setShelves(shelfPose);
  }

  function springs(dt) {
    let active = false;
    const steps = Math.ceil(dt * 240);
    const h = dt / steps;
    for (let i = 0; i < n; i++) {
      if (ln[i] === lnT[i] && !lnV[i] && !br[i] && !brV[i]) continue;
      active = true;
      for (let k = 0; k < steps; k++) {
        lnV[i] += (180 * (lnT[i] - ln[i]) - 15 * lnV[i]) * h;
        ln[i] += lnV[i] * h;
        brV[i] += (-160 * br[i] - 9 * brV[i]) * h;
        br[i] += brV[i] * h;
      }
      if (Math.abs(ln[i] - lnT[i]) < 1e-4 && Math.abs(lnV[i]) < 1e-3) { ln[i] = lnT[i]; lnV[i] = 0; }
      if (Math.abs(br[i]) < 1e-4 && Math.abs(brV[i]) < 1e-3) { br[i] = 0; brV[i] = 0; }
    }
    return active;
  }

  function kick(i, speed) {
    if (reduce.matches || (held && held.i === i)) return;
    brV[i] += Math.min(2.2, 0.4 + speed * 1.1);
  }

  function brushFrom(a, b, speed) {
    if (a < 0 || b < 0 || a === b) return;
    const ia = state.L.items[a];
    const ib = state.L.items[b];
    if (ia.shelf !== ib.shelf) {
      kick(b, speed);
      return;
    }
    const list = state.L.shelves[ia.shelf].list;
    const step = ib.rank > ia.rank ? 1 : -1;
    for (let j = ia.rank + step; j !== ib.rank + step; j += step) kick(list[j], speed);
    invalidate();
  }

  function neighbours(i) {
    const it = state.L.items[i];
    const list = state.L.shelves[it.shelf].list;
    return [list[it.rank - 1], list[it.rank + 1]];
  }

  function heldTarget() {
    const v = gl.view;
    const d = dims[held.i];
    const ch = canvas.clientHeight;
    const top = nav ? Math.max(0, nav.getBoundingClientRect().bottom) : 0;
    const bottom = Math.min(window.innerHeight, ch);
    const ppw = ch / v.hv;
    const dist = Math.max(d.h * v.D * ppw / (Math.max(120, bottom - top) * 0.85), W * v.D / (0.8 * cam.span));
    const k = dist / v.D;
    const fy = cam.yTop - (top + bottom) / 2 / ppw;
    return { x: cam.cx, y: lerp(v.eyeY, fy, k) - d.h / 2, z: lerp(v.D, 0, k) };
  }

  const heldPose = { x: 0, y: 0, z: 0, rot: 0, sx: 1, sy: 1, sz: W, brush: 0, front: 0, lean: 0, pivot: 0 };
  function stepHeld(now) {
    const h = held;
    const ms = reduce.matches ? 0 : 1;
    const e = ms ? ease(clamp((now - h.pt0) / FLY, 0, 1)) : 1;
    const to = h.phase === 'down' ? { x: P[h.i * 4], y: P[h.i * 4 + 1], z: P[h.i * 4 + 2] } : heldTarget();
    heldPose.x = lerp(h.pf.x, to.x, e);
    heldPose.y = lerp(h.pf.y, to.y, e);
    heldPose.z = lerp(h.pf.z, to.z, e);
    const re = ms ? ease(clamp((now - h.rt0) / h.rdur, 0, 1)) : 1;
    heldPose.rot = lerp(h.rf, h.rt, re);
    heldPose.sx = dims[h.i].t;
    heldPose.sy = dims[h.i].h;
    gl.setHeld(heldPose);
    const p = gl.project(-0.5, 23 / dims[h.i].h, 0.25);
    grLink.style.transform = 'translate(' + p.x.toFixed(1) + 'px, ' + p.y.toFixed(1) + 'px) translate(-50%, -50%)';
    const settled = e === 1 && re === 1;
    if (h.phase === 'down') {
      if (e > 0.6) neighbours(h.i).forEach((j) => { if (j !== undefined) lnT[j] = 0; });
      if (e === 1) {
        gl.holdBook(-1);
        if (h.big) h.big.dispose();
        h.back.dispose();
        held = null;
        dirty = true;
        return true;
      }
    }
    return !settled;
  }

  function describe(i) {
    const b = books[i];
    const parts = [titleOf(b) + ', ' + authorOf(b)];
    if (b.r) parts.push(t('books.stars_of', b.r));
    if (b.d) parts.push(t('books.read_in', b.d.slice(0, 4)));
    if (b.n > 1) parts.push(t('books.read_times', b.n));
    if (b.p) parts.push(t('books.pages', b.p));
    return parts.join(' · ');
  }

  function lift(i, returnTo) {
    if (held) {
      if (held.phase !== 'down') return;
      finishNow();
    }
    const now = performance.now();
    bookPose(i, pose);
    const backTex = gl.canvasTexture(drawBack(books[i], W, dims[i].h, t));
    held = {
      i,
      phase: 'up',
      pf: { x: pose.x, y: pose.y, z: pose.z },
      pt0: now,
      rf: pose.rot,
      rt: -Math.PI / 2,
      rt0: now + (state.view === 'covers' ? 0 : 180),
      rdur: FLIP,
      rear: false,
      back: backTex,
      big: null,
      returnTo: returnTo || null,
    };
    gl.holdBook(i, backTex);
    const h = held;
    const url = bigCover(books[i].cv);
    if (url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (held !== h || h.phase === 'down') return;
        h.big = gl.imageTexture(img);
        gl.heldCover(h.big);
        invalidate();
      };
      img.src = url;
    }
    setHover(-1);
    if (!reduce.matches) {
      const [a, b] = neighbours(i);
      const gap = footprint(i, P[i * 4 + 3]) / 2 + GAP;
      if (a !== undefined) lnT[a] = -Math.min(LEAN, Math.asin(Math.min(1, (gap - 1) / dims[a].h)));
      if (b !== undefined) lnT[b] = Math.min(LEAN, Math.asin(Math.min(1, (gap - 1) / dims[b].h)));
    }
    heldEl.hidden = false;
    root.classList.add('holding');
    heldEl.classList.remove('rear');
    heldEl.setAttribute('aria-label', titleOf(books[i]));
    heldText.textContent = describe(i);
    grLink.href = books[i].u;
    heldEl.focus({ preventScroll: true });
    dirty = true;
    invalidate();
  }

  function flip(rear) {
    if (!held || held.phase === 'down') return;
    const now = performance.now();
    held.rear = rear === undefined ? !held.rear : rear;
    held.rf = heldPose.rot;
    held.rt = held.rear ? -1.5 * Math.PI : -Math.PI / 2;
    held.rt0 = now;
    held.rdur = FLIP;
    heldEl.classList.toggle('rear', held.rear);
    invalidate();
  }

  function drop() {
    if (!held || held.phase === 'down') return;
    const now = performance.now();
    const covers = state.view === 'covers';
    held.phase = 'down';
    held.pf = { x: heldPose.x, y: heldPose.y, z: heldPose.z };
    held.pt0 = now;
    held.rf = heldPose.rot;
    held.rt = covers ? (held.rear ? -2.5 * Math.PI : -Math.PI / 2) : (held.rear ? -2 * Math.PI : 0);
    held.rt0 = now;
    held.rdur = FLY;
    const back = held.returnTo;
    const inside = heldEl.contains(document.activeElement);
    heldEl.hidden = true;
    root.classList.remove('holding');
    heldEl.classList.remove('rear');
    if (inside && back) back.focus({ preventScroll: true });
    invalidate();
  }

  function finishNow() {
    held.pt0 = held.rt0 = -1e9;
    stepHeld(performance.now());
  }

  let raf = 0;
  let last = 0;
  let ready = false;
  let liveT0 = 0;
  let litT0 = 0;
  let lit = false;
  let quick = null;
  let seen = [];
  const veil = getComputedStyle(root, '::before');
  const darkness = veil.content === 'none' ? 0 : parseFloat(veil.opacity) || 0;
  let intro = darkness > 0;
  if (!intro) root.classList.add('soft');
  const shownV = new Float32Array(n * 4);
  const fading = new Set();

  function show(i, k) {
    const j = i * 4 + k;
    if (shownV[j] === 1 || fading.has(j)) return;
    if (reduce.matches) {
      shownV[j] = 1;
      gl.setState(i, k, 1);
    } else fading.add(j);
  }

  function stepFades(dt) {
    fading.forEach((j) => {
      shownV[j] = Math.min(1, shownV[j] + dt / FADE);
      gl.setState(j >> 2, j & 3, ease(shownV[j]));
      if (shownV[j] === 1) fading.delete(j);
    });
  }

  function switchOn(now) {
    litT0 = now;
    lit = true;
    root.classList.add('lit');
  }

  function applyIntro(el) {
    const k = introK(el, { reduce: reduce.matches, lampOn, quick });
    if (k === 0) intro = false;
    const v = introLevels(k, intro, lampOn, darkness);
    gl.setUnlit(v.unlit);
    gl.setSketch(v.sketch);
  }

  function stepLight(now) {
    if (!lit) {
      const el = now - liveT0;
      if (quick === null && el >= LIGHT_MIN) quick = seen.every((i) => tex.loaded(i));
      if (el >= LIGHT_MAX || (el >= LIGHT_MIN && seen.every((i) => tex.drawn(i)))) switchOn(now);
    }
    applyIntro(lit ? now - litT0 : -1);
    return intro;
  }

  function visibleBooks() {
    const top = cam.yTop;
    const bottom = top - canvas.clientHeight / m.ppu;
    const out = [];
    for (let i = 0; i < n; i++) {
      const y = P[i * 4 + 1];
      if (y + dims[i].h < bottom || y > top || Math.abs(P[i * 4]) > m.span / 2 + W) continue;
      out.push(i);
    }
    return out;
  }
  function invalidate() {
    if (!raf && ready) raf = requestAnimationFrame(frame);
  }

  const pointer = { x: 0, y: 0, in: false, moved: false, speed: 0, time: 0 };
  let hovered = -1;
  let focused = -1;
  const marked = new Set();
  let globe = null;
  let globeLoad = null;

  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let busy = tex ? tex.pump() : false;
    if (intro && liveT0 && stepLight(now)) busy = true;
    if (fading.size) {
      stepFades(dt);
      busy = true;
    }
    const target = scrollTarget();
    const before = cam.yTop;
    if (trans && trans.camera) {
      Object.assign(cam, trans.camera(now));
      busy = true;
    } else {
      cam.cx = 0;
      cam.span = m.span;
      cam.yTop = reduce.matches ? target : approach(cam.yTop, target, dt, 16);
      if (Math.abs(target - cam.yTop) * m.ppu < 0.3) cam.yTop = target;
      else busy = true;
    }
    const camMoved = cam.yTop !== before;

    let moved = false;
    state.L.shelves.forEach((s) => {
      const a = off.get(s.key) || 0;
      const b = clamp(offT.get(s.key) || 0, s.minOffset, 0);
      if (a === b) return;
      const v = reduce.matches || drag ? b : approach(a, b, dt, 12);
      off.set(s.key, Math.abs(v - b) * m.ppu < 0.3 ? b : v);
      moved = true;
    });
    if (moved) {
      busy = true;
      if (!trans) home();
      dirty = true;
      updateArrows();
    }
    if (trans) {
      trans.step(now);
      busy = true;
      dirty = true;
    }

    gl.frustum(cam);
    if (globe && globe.active && globe.frame(now, dt)) busy = true;
    if (lampOn) placeLamp();
    if (lit && pointer.in && !drag && !held && (pointer.moved || camMoved || dirty)) {
      pointer.moved = false;
      const hit = trans ? -1 : gl.pick(pointer.x, pointer.y);
      if (hit !== hovered) {
        brushFrom(hovered, hit, pointer.speed);
        setHover(hit);
      }
    }
    if (springs(dt)) {
      dirty = true;
      busy = true;
    }
    if (held && stepHeld(now)) busy = true;
    if (lampOn && held) placeLamp();
    const dimT = held && held.phase !== 'down' ? 0.4 : 0;
    if (dim !== dimT) {
      dim = reduce.matches ? dimT : approach(dim, dimT, dt, 10);
      if (Math.abs(dim - dimT) < 0.003) dim = dimT;
      gl.setDim(dim);
      busy = true;
    }
    for (let i = 0; i < n; i++) {
      if (hv[i] === hvT[i]) continue;
      hv[i] = reduce.matches ? hvT[i] : approach(hv[i], hvT[i], dt, 14);
      if (Math.abs(hv[i] - hvT[i]) < 0.002) hv[i] = hvT[i];
      dirty = true;
      busy = true;
    }
    if (dirty) {
      writeBooks();
      dirty = false;
    }
    if (camMoved || moved) updateTier();
    if (globe && globe.active) globe.render(gl.draw);
    else gl.draw();
    if (!liveT0) {
      liveT0 = now;
      root.classList.add('live');
      bar.hidden = false;
      rail.hidden = false;
      navHeight();
      if (intro) busy = true;
      else {
        lit = true;
        root.classList.add('lit');
      }
    }
    if (busy) invalidate();
    else last = 0;
  }

  function labelText(l) {
    if (!l) return '';
    const count = l.count ? ', ' + t('books.count', l.count) : '';
    if (l.kind === 'stars') return t('books.stars', l.n) + count;
    if (l.kind === 'unrated') return t('books.unrated') + count;
    if (l.kind === 'year') return l.year + count;
    if (l.kind === 'years') return t('books3d.years', l.year) + count;
    if (l.kind === 'undated') return t('books3d.undated') + count;
    if (l.kind === 'letters') return l.text + count;
    if (l.kind === 'hue') return t('books3d.hue_' + l.hue) + count;
    if (l.kind === 'region') return regionName(l.id) + count;
    if (l.kind === 'unplaced') return t('books3d.unplaced') + count;
    return '';
  }

  function buildList() {
    const L = state.L;
    const frag = document.createDocumentFragment();
    const add = (label, items) => {
      if (label) {
        const h = document.createElement('h2');
        h.textContent = label;
        frag.appendChild(h);
      }
      const ol = document.createElement('ol');
      items.forEach((i) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.i = i;
        b.textContent = titleOf(books[i]) + ', ' + authorOf(books[i]);
        li.appendChild(b);
        ol.appendChild(li);
      });
      frag.appendChild(ol);
    };
    if (L.grouped) L.shelves.forEach((s) => add(labelText(s.label), s.list));
    else add('', L.shelves.flatMap((s) => s.list));
    list.textContent = '';
    list.appendChild(frag);
  }

  let listTimer = 0;
  function scheduleList(delay) {
    clearTimeout(listTimer);
    listTimer = setTimeout(buildList, delay);
  }

  function focusBook(i) {
    focused = i;
    setHover(hovered);
    const it = state.L.items[i];
    const s = state.L.shelves[it.shelf];
    const x = s.x0 + offsetOf(s) + it.lx;
    if (Math.abs(x - cam.cx) > m.span / 2 - it.w) slide(s, cam.cx - x);
    const yc = s.y + dims[i].h / 2;
    const py = (scrollTarget() - yc) * m.ppu;
    if (py < window.innerHeight * 0.25 || py > window.innerHeight * 0.75) {
      window.scrollTo(0, Math.max(0, window.scrollY + py - window.innerHeight / 2));
    }
  }

  function setHover(i) {
    hovered = i;
    for (let k = 0; k < n; k++) hvT[k] = k === hovered || k === focused || marked.has(k) ? 1 : 0;
    document.documentElement.style.cursor = i >= 0 ? 'pointer' : '';
    invalidate();
  }

  function shelfAt(clientY) {
    const y = cam.yTop - clientY / m.ppu;
    return state.L.shelves.find((s) => y >= s.y - LIP - 12 && y <= s.y + s.tallest + 24) || null;
  }

  function slide(s, dx) {
    if (!s || s.minOffset === 0) return false;
    offT.set(s.key, clamp((offT.get(s.key) || 0) + dx, s.minOffset, 0));
    updateArrows();
    invalidate();
    return true;
  }

  function slideNow(s, dx) {
    const o = clamp((off.get(s.key) || 0) + dx, s.minOffset, 0);
    off.set(s.key, o);
    offT.set(s.key, o);
    home();
    dirty = true;
    updateArrows();
    invalidate();
  }

  function buildArrows() {
    arrows.textContent = '';
    arrows.style.left = -stage.getBoundingClientRect().left + 'px';
    arrows.style.width = canvas.clientWidth + 'px';
    state.L.shelves.forEach((s) => {
      if (s.minOffset === 0) return;
      ['prev', 'next'].forEach((k) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'key round b3d-arrow ' + k;
        b.style.top = -(s.y + s.tallest / 2) * m.ppu + 'px';
        b.dataset.key = s.key;
        b.dataset.dir = k;
        b.setAttribute('data-i18n-attr', 'aria-label:books3d.' + k);
        b.setAttribute('aria-label', t('books3d.' + k));
        b.innerHTML = CHEVRON[k];
        b.addEventListener('click', () => slide(s, (k === 'prev' ? 1 : -1) * s.avail * 0.7));
        arrows.appendChild(b);
      });
    });
    updateArrows();
  }

  function updateArrows() {
    arrows.querySelectorAll('.b3d-arrow').forEach((b) => {
      const s = state.L.shelves.find((x) => x.key === b.dataset.key);
      const o = clamp(offT.get(s.key) || 0, s.minOffset, 0);
      const hide = b.dataset.dir === 'prev' ? o >= -1 : o <= s.minOffset + 1;
      if (b.hidden !== hide) b.hidden = hide;
    });
  }

  function headHtml(l) {
    let head = '';
    if (l.kind === 'stars') {
      for (let k = 1; k <= 5; k++) head += STAR.replace('%', k <= l.n ? 'on' : 'off');
      head = '<span class="stars">' + head + '</span>';
    } else if (l.kind === 'unrated') head = t('books.unrated');
    else if (l.kind === 'year') head = l.year;
    else if (l.kind === 'years') head = t('books3d.years', l.year);
    else if (l.kind === 'undated') head = t('books3d.undated');
    else if (l.kind === 'letters') head = l.text;
    else if (l.kind === 'hue') head = '<span class="sw" style="background:' + l.c + '"></span>' + t('books3d.hue_' + l.hue);
    else if (l.kind === 'region') head = regionName(l.id);
    else if (l.kind === 'unplaced') head = t('books3d.unplaced');
    return '<span class="h">' + head + '</span>';
  }

  let tierKey = null;
  let mark = null;
  function updateTier(force) {
    if (mark) {
      tier.classList.remove('empty');
      tier.innerHTML = '<span class="h">' + mark.name + '</span><span class="n">' + t('books.count', mark.count) + '</span>';
      tierKey = null;
      return;
    }
    const line = cam.yTop - window.innerHeight * 0.5 / m.ppu;
    let k = -1;
    state.L.shelves.forEach((x, j) => { if (k < 0 || x.y + x.tallest >= line) k = j; });
    const s = state.L.shelves[k];
    const v = s ? inView(state.L, k, offsetOf(s), cam.cx, cam.span) : null;
    updateRail(s, v);
    const l = s && s.label;
    const key = (s ? s.key : '') + (v ? ':' + v.a + '-' + v.z : '');
    if (key === tierKey && !force) return;
    tierKey = key;
    tier.classList.toggle('empty', !l);
    if (!l) {
      tier.textContent = '';
      return;
    }
    const span = v ? (v.a === v.z ? v.a : v.a + '–' + v.z) + ' / ' + v.count : l.count;
    const count = l.count ? '<span class="n">' + t('books.count', span) + '</span>' : '';
    const at = v ? '<span class="at" style="--a:' + (v.a - 1) / v.count + ';--b:' + v.z / v.count + '"></span>' : '';
    tier.innerHTML = headHtml(l) + count + at;
  }

  let railSort = null;
  let railP = -1;
  let railCur = -1;
  let railDrag = null;
  function buildRail(force) {
    if (railSort === state.sort && !force) return;
    railSort = state.sort;
    track.textContent = '';
    state.L.sections.forEach((s, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'b3d-seg';
      b.dataset.k = k;
      b.style.top = s.at * 100 + '%';
      b.style.height = s.size * 100 + '%';
      if (s.label.kind === 'hue') b.style.setProperty('--seg', s.label.c);
      b.setAttribute('aria-label', labelText(s.label));
      track.appendChild(b);
    });
    railP = -1;
    railCur = -1;
    tip.classList.remove('show');
  }

  function sectionAt(ord) {
    const S = state.L.sections;
    let k = 0;
    while (k < S.length - 1 && S[k + 1].from <= ord) k++;
    return k;
  }

  function updateRail(s, v) {
    if (!s) return;
    const mid = v ? (v.a + v.z) / 2 - 1 : (s.count - 1) / 2;
    const p = (s.first + mid + 0.5) / n;
    if (Math.abs(p - railP) > 0.0005) {
      railP = p;
      rail.style.setProperty('--p', p.toFixed(4));
    }
    const cur = sectionAt(Math.floor(p * n));
    if (cur === railCur) return;
    railCur = cur;
    track.querySelectorAll('.b3d-seg').forEach((b, k) => {
      b.classList.toggle('on', k === cur);
      b.classList.toggle('past', k < cur);
    });
  }

  function showTip(k, y) {
    const sec = state.L.sections[k];
    if (!sec) return;
    tip.innerHTML = headHtml(sec.label) + '<span class="n">' + t('books.count', sec.count) + '</span>';
    tip.style.top = y + 'px';
    tip.classList.add('show');
  }

  function jump(ord) {
    const L = state.L;
    const i = L.order[clamp(ord, 0, n - 1)];
    const s = L.shelves[L.items[i].shelf];
    const py = (scrollTarget() - (s.y + s.tallest / 2)) * m.ppu;
    window.scrollTo(0, Math.max(0, Math.round(window.scrollY + py - window.innerHeight / 2)));
  }

  function railTo(clientY) {
    const r = track.getBoundingClientRect();
    const f = clamp((clientY - r.top) / r.height, 0, 0.9999);
    const ord = Math.floor(f * n);
    jump(ord);
    showTip(sectionAt(ord), clientY - r.top);
  }

  rail.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !lit) return;
    e.preventDefault();
    railDrag = e.pointerId;
    rail.setPointerCapture(e.pointerId);
    rail.classList.add('drag');
    railTo(e.clientY);
  });
  rail.addEventListener('pointermove', (e) => {
    if (railDrag === e.pointerId) railTo(e.clientY);
    else if (e.pointerType === 'mouse') {
      const b = e.target.closest('.b3d-seg');
      if (b) showTip(Number(b.dataset.k), e.clientY - track.getBoundingClientRect().top);
    }
  });
  const endRail = (e) => {
    if (railDrag !== e.pointerId) return;
    railDrag = null;
    rail.classList.remove('drag');
    tip.classList.remove('show');
  };
  rail.addEventListener('pointerup', endRail);
  rail.addEventListener('pointercancel', endRail);
  rail.addEventListener('pointerleave', () => { if (railDrag === null) tip.classList.remove('show'); });
  rail.addEventListener('click', (e) => {
    const b = e.target.closest('.b3d-seg');
    if (b && !e.detail) jump(state.L.sections[Number(b.dataset.k)].from);
  });
  rail.addEventListener('focusin', (e) => {
    const b = e.target.closest('.b3d-seg');
    if (b && b.matches(':focus-visible')) showTip(Number(b.dataset.k), b.offsetTop + b.offsetHeight / 2);
  });
  rail.addEventListener('focusout', () => { if (railDrag === null) tip.classList.remove('show'); });

  function setView(v) {
    if (v === state.view) return;
    if (globe && globe.active) return globe.close(() => setView(v));
    state.view = v;
    viewKey.setAttribute('aria-pressed', String(v === 'covers'));
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) {}
    setHover(-1);
    relayout('turn');
    invalidate();
  }

  const sortBtns = bar.querySelectorAll('[data-sort-set]');
  function setSort(v) {
    if (v === state.sort || !SORT_NAMES.includes(v)) return;
    if (globe && globe.active) return globe.close(() => setSort(v));
    state.sort = v;
    sortBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sortSet === v)));
    showSort();
    try { localStorage.setItem(SORT_KEY, v); } catch (e) {}
    setHover(-1);
    relayout('shuffle');
    scheduleList(reduce.matches ? 0 : SHUFFLE + 100);
    tierKey = null;
    invalidate();
  }
  sortBtns.forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.sortSet === state.sort));
    b.addEventListener('click', () => {
      setSort(b.dataset.sortSet);
      if (sortKey.getAttribute('aria-expanded') === 'true') closeSorts(true);
    });
  });
  viewKey.setAttribute('aria-pressed', String(state.view === 'covers'));
  viewKey.addEventListener('click', () => setView(state.view === 'covers' ? 'spines' : 'covers'));

  function showSort() {
    const cur = sortKey.querySelector('.cur');
    cur.dataset.i18n = 'books3d.sort_' + state.sort;
    cur.textContent = t(cur.dataset.i18n);
  }
  function closeSorts(refocus) {
    sortKey.setAttribute('aria-expanded', 'false');
    bar.classList.remove('open');
    if (refocus) sortKey.focus();
  }
  showSort();
  sortKey.addEventListener('click', () => {
    if (sortKey.getAttribute('aria-expanded') === 'true') return closeSorts(false);
    sortKey.setAttribute('aria-expanded', 'true');
    bar.classList.add('open');
    (bar.querySelector('[data-sort-set][aria-pressed="true"]') || sortBtns[0]).focus();
  });
  bar.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !bar.classList.contains('open')) return;
    e.preventDefault();
    closeSorts(true);
  });
  bar.addEventListener('focusout', (e) => {
    if (bar.classList.contains('open') && e.relatedTarget && !bar.contains(e.relatedTarget)) closeSorts(false);
  });
  window.addEventListener('pointerdown', (e) => {
    if (!bar.classList.contains('open') || bar.contains(e.target)) return;
    e.stopPropagation();
    closeSorts(false);
  }, true);

  const isScene = (el) => el === stage || el === canvas || el === document.body || el === document.documentElement || el === root || el.id === 'main';

  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !isScene(e.target) || trans || !lit) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, time: e.timeStamp, v: 0, s: shelfAt(e.clientY), mode: null };
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      const dtm = Math.max(1, e.timeStamp - pointer.time);
      pointer.speed = 0.6 * pointer.speed + 0.4 * (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) / dtm);
      pointer.time = e.timeStamp;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.in = isScene(e.target);
      pointer.moved = true;
      if (!pointer.in && hovered >= 0) setHover(-1);
      invalidate();
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.mode) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        drag.mode = drag.s && drag.s.minOffset < 0 ? 'slide' : 'brush';
        drag.x = e.clientX;
        drag.hit = -1;
        if (drag.mode === 'slide') setHover(-1);
      } else if (Math.abs(dy) > 8) {
        drag = null;
        return;
      }
    }
    if (drag.mode === 'brush') {
      const hit = gl.pick(e.clientX, e.clientY);
      const speed = Math.abs(e.clientX - drag.x) / Math.max(1, e.timeStamp - drag.time);
      if (hit >= 0 && drag.hit >= 0) brushFrom(drag.hit, hit, speed);
      drag.hit = hit;
      drag.x = e.clientX;
      drag.time = e.timeStamp;
    }
    if (drag.mode === 'slide') {
      const step = (e.clientX - drag.x) / m.ppu;
      drag.v = 0.7 * drag.v + 0.3 * (step / Math.max(1, e.timeStamp - drag.time));
      drag.x = e.clientX;
      drag.time = e.timeStamp;
      slideNow(drag.s, step);
    }
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.mode === 'slide' && !reduce.matches && e.timeStamp - d.time < 80) slide(d.s, d.v * 280);
    if (!d.mode && e.type === 'pointerup' && !trans) {
      const hit = gl.pick(e.clientX, e.clientY);
      if (hit >= 0) lift(hit);
    }
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  document.addEventListener('mouseout', (e) => {
    if (e.relatedTarget) return;
    pointer.in = false;
    if (hovered >= 0) setHover(-1);
  });

  window.addEventListener('wheel', (e) => {
    if (!isScene(e.target) || trans || !lit || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const s = shelfAt(e.clientY);
    if (!s || s.minOffset === 0) return;
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerWidth : 1;
    slideNow(s, -e.deltaX * k / m.ppu);
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || trans || !lit || (globe && globe.active)) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    const s = shelfAt(window.innerHeight / 2);
    if (s && slide(s, (e.key === 'ArrowLeft' ? 1 : -1) * s.avail * 0.7)) e.preventDefault();
  });

  list.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) lift(Number(b.dataset.i), b);
  });
  list.addEventListener('focusin', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) focusBook(Number(b.dataset.i));
  });
  list.addEventListener('focusout', (e) => {
    if (e.relatedTarget && list.contains(e.relatedTarget)) return;
    focused = -1;
    setHover(hovered);
  });

  heldEl.addEventListener('click', (e) => {
    if (!held || e.target.closest('a')) return;
    if (gl.pickHeld(e.clientX, e.clientY)) flip();
    else drop();
  });
  heldEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      drop();
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target === heldEl) {
      e.preventDefault();
      flip();
    }
  });
  grLink.addEventListener('focus', () => flip(true));
  heldEl.addEventListener('focusout', () => {
    setTimeout(() => {
      if (held && held.phase !== 'down' && document.hasFocus() && !heldEl.contains(document.activeElement)) drop();
    }, 0);
  });

  let lampOn = false;
  function applyColors() {
    const tokens = readTokens(TOKENS);
    gl.setColors(tokens);
    const d = tokens.desk;
    lampOn = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2] < 0.3;
    placeLamp();
    if (globe) globe.colors(lampOn);
    if (!liveT0 && !lampOn) root.classList.add('soft');
    if (intro) applyIntro(lit ? performance.now() - litT0 : -1);
    invalidate();
  }

  function placeLamp() {
    gl.setLamp(lampOn && lit, lampOn);
  }

  const nav = document.querySelector('.nav');
  function navHeight() {
    if (nav) root.style.setProperty('--nav-h', nav.offsetHeight + 'px');
    root.style.setProperty('--bar-h', bar.offsetHeight + 'px');
  }

  let width = 0;
  new ResizeObserver(() => {
    gl.resize(canvas.clientWidth, canvas.clientHeight);
    navHeight();
    if (canvas.clientWidth !== width) {
      width = canvas.clientWidth;
      relayout(false);
      cam.yTop = scrollTarget();
    }
    updateTier(true);
    invalidate();
  }).observe(canvas);

  navHeight();
  gl.resize(canvas.clientWidth, canvas.clientHeight);
  width = canvas.clientWidth;
  relayout(false);
  applyColors();
  cam.yTop = scrollTarget();
  writeBooks();
  dirty = false;
  updateTier(true);

  let fontsReady = false;
  function loadTextures() {
    tex = createTextures(gl, books, dims, {
      density: m.ppu * Math.min(window.devicePixelRatio || 1, 2),
      fontsReady: () => fontsReady,
      show,
    });
    gl.setTextures(tex.covers, null);
    const center = cam.yTop - canvas.clientHeight / m.ppu / 2;
    const distance = (i) => Math.abs(P[i * 4 + 1] + dims[i].h / 2 - center) * 4 + Math.abs(P[i * 4] - cam.cx);
    tex.start(books.map((b, i) => i).sort((a, b) => distance(a) - distance(b)), invalidate);
    if (fontsReady) tex.fontsChanged();
  }
  loadTextures();
  canvas.addEventListener('webglcontextrestored', () => {
    for (let i = 0; i < n; i++) {
      gl.setState(i, 0, 0);
      gl.setState(i, 3, 0);
    }
    shownV.fill(0);
    fading.clear();
    loadTextures();
    applyColors();
    dirty = true;
    invalidate();
  });
  const drawText = () => {
    fontsReady = true;
    tex.fontsChanged();
    invalidate();
  };
  const fontTimer = setTimeout(drawText, 3000);
  loadFonts(books).then(() => {
    clearTimeout(fontTimer);
    drawText();
  });
  document.addEventListener('langchange', () => {
    navHeight();
    globeLabel(globeKey.querySelector('.lbl').dataset.i18n);
    buildRail(true);
    updateTier(true);
    scheduleList(0);
    if (held && held.phase !== 'down') {
      const old = held.back;
      held.back = gl.canvasTexture(drawBack(books[held.i], W, dims[held.i].h, t));
      gl.holdBook(held.i, held.back);
      if (held.big) gl.heldCover(held.big);
      old.dispose();
      heldEl.setAttribute('aria-label', titleOf(books[held.i]));
      heldText.textContent = describe(held.i);
      invalidate();
    }
    if (!fontsReady) return;
    tex.fontsChanged();
    invalidate();
  });

  function loadGlobe() {
    if (!globeLoad) {
      globeLoad = import('books3d/globe.js').then((mod) => mod.createGlobe({
        renderer: gl.renderer,
        shelfCamera: () => gl.camera,
        books,
        geo,
        atlas: root.dataset.atlas,
        root,
        t,
        lang,
        reduce,
        invalidate,
        onClosed: globeClosed,
      })).then((g) => {
        globe = g;
        globe.colors(lampOn);
        g.warm();
        globe.card.addEventListener('click', (e) => {
          if (e.target.closest('button[data-k]')) closeMap(false);
        });
        return g;
      });
      globeLoad.catch(() => { globeKey.hidden = true; });
    }
    return globeLoad;
  }

  function openGlobe() {
    loadGlobe().then((g) => {
      if (held) drop();
      clearMark();
      setHover(-1);
      const { R, x } = globeSpot(m.span, m.vw, window.innerHeight);
      const z = gl.view.D;
      g.open({ x, y: -state.L.height / 2, z }, R, (SHELF_FRONT - z) / R);
      root.classList.add('globe');
      document.documentElement.classList.remove('nav-up');
      globeLabel('books3d.globe_back');
      placeLamp();
      invalidate();
    });
  }

  function globeClosed(then) {
    root.classList.remove('globe');
    globeLabel('books3d.globe');
    closeMap(false);
    placeLamp();
    invalidate();
    if (typeof then === 'function') then();
    else if (then && then.country) goShelf(then.country, then.book);
    else if (then) goShelf(then);
  }

  function globeLabel(k) {
    const l = globeKey.querySelector('.lbl');
    l.dataset.i18n = k;
    l.textContent = t(k);
    globeKey.title = t(k);
  }

  globeKey.addEventListener('click', () => {
    if (!lit) return;
    if (globe && globe.active) globe.close();
    else openGlobe();
  });

  function openMap() {
    if (!globe) return;
    mapKey.setAttribute('aria-expanded', 'true');
    globe.card.classList.add('open');
  }
  function closeMap(refocus) {
    if (mapKey.getAttribute('aria-expanded') !== 'true') return;
    mapKey.setAttribute('aria-expanded', 'false');
    if (globe) globe.card.classList.remove('open');
    if (refocus) mapKey.focus();
  }
  mapKey.addEventListener('click', () => {
    if (mapKey.getAttribute('aria-expanded') === 'true') closeMap(false);
    else openMap();
  });
  window.addEventListener('pointerdown', (e) => {
    if (mapKey.getAttribute('aria-expanded') !== 'true' || mapKey.contains(e.target) || (globe && globe.card.contains(e.target)) || e.target.closest('.nav')) return;
    e.stopPropagation();
    closeMap(false);
    const swallow = (ev) => { ev.stopPropagation(); };
    window.addEventListener('pointerup', swallow, { capture: true, once: true });
  }, true);
  document.addEventListener('keydown', (e) => {
    if (!globe || !globe.on || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape' && mapKey.getAttribute('aria-expanded') === 'true') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeMap(true);
      return;
    }
    if (globe.keydown(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  const MARK_STEP = 40;
  let markTimers = [];
  function clearMark() {
    markTimers.forEach(clearTimeout);
    markTimers = [];
    if (!mark) return;
    mark = null;
    marked.clear();
    setHover(hovered);
    updateTier(true);
    invalidate();
  }
  function goShelf(country, book) {
    const wait = state.sort === 'region' || reduce.matches ? 0 : SHUFFLE;
    if (state.sort !== 'region') setSort('region');
    const L = state.L;
    const run = countryRun(L, books, country);
    if (!run) return;
    const s = L.shelves[run.shelf];
    const ids = s.list.slice(run.from, run.from + run.count);
    const a = L.items[ids[0]];
    const z = L.items[ids[ids.length - 1]];
    const left = a.lx - a.w / 2;
    const width = z.lx + z.w / 2 - left;
    const o = width < m.span * 0.8 ? -(s.x0 + left + width / 2) : -m.span / 2 + m.span * 0.08 - (s.x0 + left);
    offT.set(s.key, clamp(o, s.minOffset, 0));
    if (reduce.matches || wait) off.set(s.key, offT.get(s.key));
    const py = (scrollTarget() - (s.y + s.tallest / 2)) * m.ppu;
    window.scrollTo(0, Math.max(0, Math.round(window.scrollY + py - window.innerHeight / 2)));
    const c = geo.countries[country];
    mark = { name: lang() === 'zh' ? c.zh : country, count: run.count };
    updateTier(true);
    ids.forEach((i, k) => {
      markTimers.push(setTimeout(() => {
        marked.add(i);
        hvT[i] = 1;
        invalidate();
      }, wait + k * MARK_STEP));
    });
    markTimers.push(setTimeout(() => {
      const end = () => {
        ['pointerdown', 'wheel', 'keydown'].forEach((ev) => window.removeEventListener(ev, end, true));
        clearMark();
      };
      ['pointerdown', 'wheel', 'keydown'].forEach((ev) => window.addEventListener(ev, end, true));
    }, wait + 50));
    if (book !== undefined) markTimers.push(setTimeout(() => lift(book), wait + ids.length * MARK_STEP + 250));
    invalidate();
  }

  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
  const whenLit = () => (lit ? idle(() => loadGlobe()) : setTimeout(whenLit, 300));
  if (globeKey && geo.countries) whenLit();
  else if (globeKey) globeKey.hidden = true;

  buildList();
  window.addEventListener('scroll', invalidate, { passive: true });
  watchTheme(applyColors);
  await gl.warm();
  ready = true;
  seen = visibleBooks();
  invalidate();
}

start();
