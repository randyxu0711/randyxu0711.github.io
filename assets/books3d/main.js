import { layout, thickness, height, W, PAD, GAP, LIP } from 'books3d/layout.js';
import { readTokens, hexRgb, watchTheme } from 'books3d/colors.js';
import { createScene } from 'books3d/scene.js';
import { createTextures, loadFonts } from 'books3d/textures.js';
import { ease, lerp, clamp, approach } from 'books3d/anim.js';

const root = document.getElementById('b3d');
const stage = document.getElementById('b3d-scene');
const bar = document.getElementById('b3d-bar');
const tier = document.getElementById('b3d-tier');
const arrows = document.getElementById('b3d-arrows');
const books = JSON.parse(document.getElementById('b3d-data').textContent);
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const n = books.length;
const VIEW_KEY = 'books3d-view';
const STAGGER = 400;
const TURN = 600;
const SLIDE_OUT = 14;
const STAR = '<svg class="%" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.6l2.55 5.4 5.9.72-4.35 4.06 1.12 5.86L10 14.76l-5.22 2.88 1.12-5.86L1.55 7.72l5.9-.72z"/></svg>';
const CHEVRON = {
  prev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const dims = books.map((b) => ({ t: thickness(b), h: height(b), color: hexRgb(b.c), ink: hexRgb(b.k || '#f7f3ea') }));

const t = (k, num) => (window.siteI18n ? window.siteI18n.t(k, num) : k);
const rotOf = (view) => (view === 'covers' ? -Math.PI / 2 : 0);
const zOf = (view, i) => (view === 'covers' ? -dims[i].t / 2 : -W / 2);
const footprint = (i, rot) => dims[i].t * Math.abs(Math.cos(rot)) + W * Math.abs(Math.sin(rot));

function start() {
  let gl;
  try {
    gl = createScene(books, dims);
  } catch (e) {
    return;
  }
  const canvas = gl.canvas;
  canvas.className = 'b3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  root.appendChild(canvas);
  root.classList.add('on');
  stage.hidden = false;

  let stored = null;
  try { stored = localStorage.getItem(VIEW_KEY); } catch (e) {}
  const state = { view: stored === 'covers' ? 'covers' : 'spines', sort: 'rating', L: null };
  const off = new Map();
  const offT = new Map();
  const cam = { cx: 0, yTop: 0, span: 1 };
  const P = new Float32Array(n * 4);
  const hv = new Float32Array(n);
  const hvT = new Float32Array(n);
  let m = null;
  let trans = null;
  let shelfPose = [];
  let dirty = true;
  let drag = null;
  let tex = null;

  function metrics() {
    const vw = canvas.clientWidth;
    const k = clamp((vw - 480) / (1024 - 480), 0, 1);
    const sp = Math.max((9 + 8 * k) * 28, 320 * vw / window.innerHeight);
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
    m = metrics();
    cam.span = m.span;
    const L = layout(books, { view: state.view, sort: state.sort, width: m.span, gutter: m.gutter, head: m.head });
    state.L = L;
    stage.style.height = Math.ceil(L.height * m.ppu) + 'px';

    const pivots = L.shelves.map((s) => {
      if (!oldL) return null;
      const centre = animate && s.list.includes(anchor);
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

    if (animate && oldL && !reduce.matches) planSwitch(oldL, L, from, pivots);
    else {
      trans = null;
      home();
    }
    buildArrows();
    dirty = true;
  }

  function planSwitch(oldL, L, from, pivots) {
    const left = cam.cx - cam.span / 2;
    const delay = new Float32Array(n);
    for (let i = 0; i < n; i++) delay[i] = clamp((from[i * 4] - left) / cam.span, 0, 1) * STAGGER;
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

  function writeBooks() {
    for (let i = 0; i < n; i++) {
      const d = dims[i];
      gl.setBook(i, P[i * 4], P[i * 4 + 1], P[i * 4 + 2] + hv[i] * SLIDE_OUT, P[i * 4 + 3], d.t, d.h, W);
      gl.setState(i, 1, hv[i]);
    }
    gl.booksChanged();
    gl.setShelves(shelfPose);
  }

  let raf = 0;
  let last = 0;
  function invalidate() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  const pointer = { x: 0, y: 0, in: false, moved: false };
  let hovered = -1;
  let focused = -1;

  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let busy = tex ? tex.pump() : false;
    const target = scrollTarget();
    const before = cam.yTop;
    cam.yTop = reduce.matches ? target : approach(cam.yTop, target, dt, 16);
    if (Math.abs(target - cam.yTop) * m.ppu < 0.3) cam.yTop = target;
    else busy = true;
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
    if (pointer.in && !drag && (pointer.moved || camMoved || dirty)) {
      pointer.moved = false;
      const hit = trans ? -1 : gl.pick(pointer.x, pointer.y);
      if (hit !== hovered) setHover(hit);
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
    gl.render(cam);
    if (busy) invalidate();
    else last = 0;
  }

  function setHover(i) {
    hovered = i;
    for (let k = 0; k < n; k++) hvT[k] = k === hovered || k === focused ? 1 : 0;
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

  let tierKey = null;
  function updateTier(force) {
    const line = cam.yTop - window.innerHeight * 0.5 / m.ppu;
    let s = null;
    state.L.shelves.forEach((x) => { if (!s || x.y + x.tallest >= line) s = x; });
    const key = s ? s.key : null;
    if (key === tierKey && !force) return;
    tierKey = key;
    const l = s && s.label;
    tier.classList.toggle('empty', !l);
    if (!l) {
      tier.textContent = '';
      return;
    }
    const count = '<span class="n">' + t('books.count', l.count) + '</span>';
    if (l.kind === 'stars') {
      let stars = '';
      for (let k = 1; k <= 5; k++) stars += STAR.replace('%', k <= l.n ? 'on' : 'off');
      tier.innerHTML = '<span class="stars">' + stars + '</span>' + count;
    } else if (l.kind === 'unrated') {
      tier.innerHTML = '<span class="stars-label">' + t('books.unrated') + '</span>' + count;
    }
  }

  const viewBtns = bar.querySelectorAll('[data-view-set]');
  function setView(v) {
    if (v === state.view) return;
    state.view = v;
    viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.viewSet === v)));
    try { localStorage.setItem(VIEW_KEY, v); } catch (e) {}
    setHover(-1);
    relayout(true);
    invalidate();
  }
  viewBtns.forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.viewSet === state.view));
    b.addEventListener('click', () => setView(b.dataset.viewSet));
  });

  const isScene = (el) => el === stage || el === canvas || el === document.body || el === document.documentElement || el === root || el.id === 'main';

  window.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !isScene(e.target) || trans) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, time: e.timeStamp, v: 0, s: shelfAt(e.clientY), mode: null };
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
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
        drag.mode = drag.s && drag.s.minOffset < 0 ? 'slide' : 'none';
        drag.x = e.clientX;
        if (drag.mode === 'slide') setHover(-1);
      } else if (Math.abs(dy) > 8) {
        drag = null;
        return;
      }
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
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  document.addEventListener('mouseout', (e) => {
    if (e.relatedTarget) return;
    pointer.in = false;
    if (hovered >= 0) setHover(-1);
  });

  window.addEventListener('wheel', (e) => {
    if (!isScene(e.target) || trans || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const s = shelfAt(e.clientY);
    if (!s || s.minOffset === 0) return;
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerWidth : 1;
    slideNow(s, -e.deltaX * k / m.ppu);
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || trans) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    const s = shelfAt(window.innerHeight / 2);
    if (s && slide(s, (e.key === 'ArrowLeft' ? 1 : -1) * s.avail * 0.7)) e.preventDefault();
  });

  function applyColors() {
    gl.setColors(readTokens());
    invalidate();
  }

  const nav = document.querySelector('.nav');
  function navHeight() {
    if (nav) root.style.setProperty('--nav-h', nav.offsetHeight + 'px');
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
  gl.render(cam);
  bar.hidden = false;

  let fontsReady = false;
  tex = createTextures(gl, books, dims, {
    density: m.ppu * Math.min(window.devicePixelRatio || 1, 2),
    fontsReady: () => fontsReady,
  });
  gl.setTextures(tex.covers, null);
  const center = cam.yTop - canvas.clientHeight / m.ppu / 2;
  const distance = (i) => Math.abs(P[i * 4 + 1] + dims[i].h / 2 - center) * 4 + Math.abs(P[i * 4] - cam.cx);
  tex.start(books.map((b, i) => i).sort((a, b) => distance(a) - distance(b)), invalidate);
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
    updateTier(true);
    if (!fontsReady) return;
    tex.fontsChanged();
    invalidate();
  });

  window.addEventListener('scroll', invalidate, { passive: true });
  watchTheme(applyColors);
}

start();
