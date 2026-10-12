import { layout, thickness, height, W } from 'books3d/layout.js';
import { readTokens, hexRgb, watchTheme } from 'books3d/colors.js';
import { createScene } from 'books3d/scene.js';

const root = document.getElementById('b3d');
const stage = document.getElementById('b3d-scene');
const books = JSON.parse(document.getElementById('b3d-data').textContent);
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const dims = books.map((b) => ({ t: thickness(b), h: height(b), color: hexRgb(b.c) }));

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

  const state = { view: 'spines', sort: 'rating', L: null, offsets: new Map() };
  const cam = { cx: 0, yTop: 0, span: 1 };
  let m = null;

  function metrics() {
    const vw = canvas.clientWidth;
    const k = clamp((vw - 480) / (1024 - 480), 0, 1);
    const span = Math.max((9 + 8 * k) * 28, 320 * vw / window.innerHeight);
    const ppu = vw / span;
    return { vw, vh: canvas.clientHeight, span, ppu, gutter: 16 / ppu, head: 56 / ppu + 12 };
  }

  function offsetOf(s) {
    return clamp(state.offsets.get(state.view + ':' + s.key) || 0, s.minOffset, 0);
  }

  function relayout() {
    m = metrics();
    state.L = layout(books, { view: state.view, sort: state.sort, width: m.span, gutter: m.gutter, head: m.head });
    stage.style.height = Math.ceil(state.L.height * m.ppu) + 'px';
    cam.span = m.span;
    pose();
  }

  function pose() {
    const L = state.L;
    const covers = state.view === 'covers';
    L.items.forEach((it, i) => {
      const s = L.shelves[it.shelf];
      const d = dims[i];
      gl.setBook(i, s.x0 + offsetOf(s) + it.lx, s.y, covers ? -d.t / 2 : -W / 2, covers ? -Math.PI / 2 : 0, d.t, d.h, W);
    });
    gl.booksChanged();
    gl.setShelves(L.shelves.map((s) => ({ x: s.x0 + offsetOf(s), y: s.y, length: s.length })));
  }

  function scrollTarget() {
    return stage.getBoundingClientRect().top / m.ppu;
  }

  let raf = 0;
  let last = 0;
  function invalidate() {
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let busy = false;
    const target = scrollTarget();
    if (reduce.matches) cam.yTop = target;
    else cam.yTop += (target - cam.yTop) * (1 - Math.exp(-dt * 16));
    if (Math.abs(target - cam.yTop) * m.ppu < 0.3) cam.yTop = target;
    else busy = true;
    gl.render(cam);
    if (busy) invalidate();
    else last = 0;
  }

  function applyColors() {
    gl.setColors(readTokens());
    invalidate();
  }

  let width = 0;
  new ResizeObserver(() => {
    gl.resize(canvas.clientWidth, canvas.clientHeight);
    if (canvas.clientWidth !== width) {
      width = canvas.clientWidth;
      relayout();
    }
    invalidate();
  }).observe(canvas);

  gl.resize(canvas.clientWidth, canvas.clientHeight);
  width = canvas.clientWidth;
  relayout();
  applyColors();
  cam.yTop = scrollTarget();
  gl.render(cam);

  window.addEventListener('scroll', invalidate, { passive: true });
  watchTheme(applyColors);
}

start();
