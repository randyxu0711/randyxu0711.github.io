import { readTokens, rgba, watchTheme } from 'scene3d/colors.js';
import { ease, clamp, approach } from 'scene3d/anim.js';
import { CARD, CAB, taipeiToday, pickDesk, groups, arrange, deskPose, pilePose, pileLabelPose, cameraAt, mainName, hueOf, tabSlot } from 'shares3d/layout.js';
import { createScene } from 'shares3d/scene.js';
import { createAtlas, createLabels, loadFonts } from 'shares3d/textures.js';

const root = document.getElementById('sh3d');
const stage = document.getElementById('sh3d-stage');
const bar = document.getElementById('sh3d-bar');
const items = JSON.parse(document.getElementById('sh3d-data').textContent);
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const GROUP_KEY = 'shares3d-group';
const MODES = ['tag', 'source', 'month'];
const TOKENS = ['desk', 'face', 'paper', 'paper-deep', 'edge', 'edge-n', 'edge-n-deep', 'ink', 'ink-3', 'rule', 'redline', 'sticky', 'drop-near'];
const CABINET_AT = 0.74;
const SLIDE = 380;
const STAGGER = 45;

const t = (k, n) => (window.siteI18n ? window.siteI18n.t(k, n) : k);
const lang = () => (document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'zh');
const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const gap = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

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
    root.classList.add('fail');
    return;
  }
  const canvas = gl.canvas;
  canvas.className = 'sh3d-canvas s3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  root.appendChild(canvas);
  root.classList.add('on', 'soft');
  try {
    run(gl, canvas);
  } catch (e) {
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
  let slide = null;
  let dark = false;
  let raf = 0;
  let last = 0;
  let ready = false;
  const cam = { pos: null, look: null };
  const pointer = { x: 0, y: 0, on: false };
  const tints = new Map();

  function tint(kind, key) {
    const id = kind + key;
    if (!tints.has(id)) {
      const h = hueOf(key);
      const css = kind === 'stamp' ? (dark ? `oklch(0.74 0.1 ${h})` : `oklch(0.5 0.13 ${h})`) : (dark ? `oklch(0.56 0.1 ${h})` : `oklch(0.76 0.11 ${h})`);
      tints.set(id, rgba(css).slice(0, 3));
    }
    return tints.get(id);
  }

  const atlas = createAtlas(gl, items, () => {
    gl.setCards(cardList());
    invalidate();
  });
  const labels = createLabels((tex) => gl.setTextures(null, tex));
  gl.setTextures(atlas.texture, null);

  const faces = () => [...desk, ...piles.map((p) => p.ids[0])];

  function cardList() {
    const out = [];
    const push = (i, pose, face) => {
      const it = items[i];
      const tag = it.g[0] || '';
      out.push({
        x: pose.x, y: pose.y, z: pose.z, rx: -Math.PI / 2, ry: pose.ry,
        tile: face ? atlas.tile(i) : null,
        stamp: tint('stamp', mainName(it.s)),
        tab: { x: -CARD.W / 2 + 20 + tabSlot(tag) * 22, color: tint('tab', tag) },
        sticky: !!it.n,
      });
    };
    desk.forEach((i, slot) => push(i, deskPose(slot, items[i].i, a), true));
    piles.forEach((p, pi) => {
      const stack = p.ids.slice().reverse();
      stack.forEach((i, k) => push(i, pilePose(pi, k, items[i].i, a), k === stack.length - 1));
    });
    return out;
  }

  function shadowList() {
    const out = desk.map((i, slot) => {
      const p = deskPose(slot, items[i].i, a);
      return { x: p.x, z: p.z, ry: p.ry, w: CARD.W, h: CARD.H };
    });
    piles.forEach((p, pi) => {
      const b = pilePose(pi, 0, items[p.ids[p.ids.length - 1]].i, a);
      out.push({ x: b.x, z: b.z, ry: b.ry, w: CARD.W, h: CARD.H });
    });
    out.push({ x: 0, z: cab.z - cab.depth / 2 + 12, ry: 0, w: cab.width, h: cab.depth + 24 });
    return out;
  }

  function drawerList(now) {
    return drawers.map((d, k) => {
      let dz = 0;
      if (slide !== null) dz = -(CAB.DEPTH - 20) * (1 - ease(clamp((now - slide - k * STAGGER) / SLIDE, 0, 1)));
      return { x: cab.slots[k].x, y: cab.slots[k].y, z: cab.z + dz, tile: labels.drawerTile(k) };
    });
  }

  function drawLabels() {
    labels.draw(
      drawers.map((d) => ({ name: drawerName(d), count: t('shares3d.cards', d.ids.length) })),
      piles.map((p) => `${t('shares3d.week', md(p.week))} · ${p.ids.length}`),
    );
    gl.setDrawers(drawerList(performance.now()));
    gl.setPileLabels(piles.map((p, pi) => Object.assign(pileLabelPose(pi, a), { tile: labels.pileTile(pi) })));
  }

  function progress() {
    const span = stage.offsetHeight - window.innerHeight;
    return span > 0 ? clamp(-stage.getBoundingClientRect().top / span, 0, 1) : 0;
  }

  function placeLamp(p) {
    if (!dark) {
      gl.setLamp(false);
      return;
    }
    if (p > CABINET_AT) {
      gl.setLamp(true, 0, cab.height + 120, cab.z + 260, 520);
      return;
    }
    const hit = pointer.on ? gl.deskPoint(pointer.x, pointer.y) : null;
    const x = hit ? hit[0] : cam.look[0];
    const z = hit ? Math.max(hit[2], cab.z + 60) : cam.look[2];
    gl.setLamp(true, x, 260, z + 40, 380);
  }

  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let busy = atlas.pump() || atlas.pending();
    const p = progress();
    const target = cameraAt(p, canvas.clientWidth / Math.max(1, canvas.clientHeight), a);
    if (!cam.pos || reduce.matches) {
      cam.pos = target.pos.slice();
      cam.look = target.look.slice();
    } else {
      for (let k = 0; k < 3; k++) {
        cam.pos[k] = approach(cam.pos[k], target.pos[k], dt, 8);
        cam.look[k] = approach(cam.look[k], target.look[k], dt, 8);
      }
    }
    if (gap(cam.pos, target.pos) + gap(cam.look, target.look) > 0.1) busy = true;
    bar.classList.toggle('away', p < CABINET_AT);
    if (slide !== null) {
      gl.setDrawers(drawerList(now));
      if (now - slide > SLIDE + STAGGER * drawers.length) slide = null;
      busy = true;
    }
    placeLamp(p);
    gl.render(cam);
    if (!root.classList.contains('live')) root.classList.add('live', 'lit');
    if (busy) invalidate();
    else last = 0;
  }

  function invalidate() {
    if (!raf && ready) raf = requestAnimationFrame(frame);
  }

  function applyColors() {
    const tokens = readTokens(TOKENS);
    gl.setColors(tokens);
    const d = tokens.desk;
    dark = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2] < 0.3;
    tints.clear();
    gl.setCards(cardList());
    invalidate();
  }

  function pressKeys() {
    bar.querySelectorAll('[data-group-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.groupSet === mode)));
  }

  function setMode(m) {
    if (m === mode || !MODES.includes(m)) return;
    mode = m;
    try { localStorage.setItem(GROUP_KEY, m); } catch (e) {}
    pressKeys();
    drawers = groups(items, mode);
    slide = reduce.matches ? null : performance.now();
    rearrange();
    invalidate();
  }

  function rearrange() {
    a = arrange(desk.length, piles.length, drawers.length, narrow);
    cab = a.cab;
    gl.setCabinet(cab);
    gl.setShadows(shadowList());
    gl.setCards(cardList());
    drawLabels();
  }

  bar.querySelectorAll('[data-group-set]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.groupSet)));
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.on = true;
    if (dark) invalidate();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.on = false;
    if (dark) invalidate();
  });
  window.addEventListener('scroll', invalidate, { passive: true });
  new ResizeObserver(() => {
    gl.resize(canvas.clientWidth, canvas.clientHeight);
    if (isNarrow() !== narrow) {
      narrow = !narrow;
      rearrange();
    }
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
    invalidate();
  });

  pressKeys();
  gl.resize(canvas.clientWidth, canvas.clientHeight);
  gl.setCabinet(cab);
  gl.setShadows(shadowList());
  applyColors();
  drawLabels();
  loadFonts(items).then(() => {
    drawLabels();
    atlas.want(faces());
    invalidate();
  });
  const go = () => {
    ready = true;
    invalidate();
  };
  gl.warm().then(go, go);
}

start();
