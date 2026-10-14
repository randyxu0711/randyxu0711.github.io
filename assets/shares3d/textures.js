import * as THREE from 'three';
import { wrap, clampLines } from 'scene3d/text.js';
import { CARD, IMG, mainName, thumb } from 'shares3d/layout.js';

const CW = 400;
const CH = 328;
const MM = CW / CARD.W;
const IH = Math.round(IMG.H * MM);
const PAD = 2;
const PITCH_X = CW + 2 * PAD;
const PITCH_Y = CH + 2 * PAD;
const PHOTO_Y = IH + 2 * PAD;
const PER_FRAME = 6;
const MAX_TILES = 72;
const MIP_EVERY = 500;
const LW = 256;
const LH = 128;
const LCOLS = 8;
const TW = 256;
const TH = 64;

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const QUAD_FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0);
}
`;

function cssFont(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function loadFonts(items) {
  const sample = items.map((it) => it.t).join('') + 'AaBb0123…';
  const all = Promise.all([
    document.fonts.load(`600 16px ${cssFont('--font-display', 'serif')}`, sample),
    document.fonts.load(`400 16px ${cssFont('--font-code', 'monospace')}`, 'Aa0123.-·№'),
    document.fonts.load(`700 16px ${cssFont('--font-ui', 'sans-serif')}`, 'AaBb中文分類'),
  ]).catch(() => {});
  return Promise.race([all, new Promise((r) => setTimeout(r, 3000))]);
}

function fitFont(g, text, weight, size, family, maxW, min) {
  let fs = size;
  g.font = `${weight} ${fs}px ${family}`;
  while (g.measureText(text).width > maxW && fs > min) {
    fs -= 1;
    g.font = `${weight} ${fs}px ${family}`;
  }
}

function drawCard(g, it) {
  const display = cssFont('--font-display', 'serif');
  const code = cssFont('--font-code', 'monospace');
  const x0 = 16;
  const w = CW - 2 * x0;
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#000';
  g.fillRect(0, 0, CW, CH);
  g.globalCompositeOperation = 'lighter';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillStyle = '#0f0';
  const name = mainName(it.s);
  fitFont(g, name, 600, 44, display, w - 40, 16);
  g.fillText(name, CW / 2, IH / 2);

  g.textAlign = 'left';
  g.textBaseline = 'top';
  g.fillStyle = '#f00';
  g.font = `600 19px ${display}`;
  clampLines(g, wrap(g, it.t, w), 2, w).forEach((l, n) => g.fillText(l, x0, IH + 12 + n * 25));

  const base = CH - 22;
  g.textBaseline = 'middle';
  g.font = `500 12px ${code}`;
  const label = it.x ? '封存 ARCHIVED' : it.s;
  const lw = Math.min(g.measureText(label).width, 170);
  g.save();
  g.translate(x0 + 6, base);
  g.rotate(-0.035);
  g.fillStyle = '#00f';
  g.strokeStyle = '#00f';
  g.lineWidth = 1.6;
  g.strokeRect(-6, -10, lw + 12, 20);
  g.fillText(label, 0, 1, 170);
  g.restore();
  g.fillStyle = '#0f0';
  g.font = `400 13px ${code}`;
  g.fillText(`${+it.d.slice(5, 7)}/${+it.d.slice(8, 10)}`, x0 + lw + 30, base + 1);
  if (it.seen) {
    const cx = CW - x0 - 10;
    g.strokeStyle = '#0f0';
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(cx - 7, base);
    g.lineTo(cx - 2, base + 6);
    g.lineTo(cx + 8, base - 8);
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
}

function drawPhoto(g, img) {
  const r = img.naturalWidth / Math.max(1, img.naturalHeight);
  const want = CW / IH;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (r > want) sw = sh * want;
  else sh = sw / want;
  g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, CW, IH);
}

function makeTarget(renderer, w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });
}

export function createAtlas(gl, items, onDrawn) {
  const renderer = gl.renderer;
  const max = Math.min(renderer.capabilities.maxTextureSize, 4096);
  const cols = Math.max(1, Math.floor(max / PITCH_X));
  const cap = Math.max(1, Math.min(items.length, MAX_TILES, cols * Math.floor(max / PITCH_Y)));
  const rows = Math.ceil(cap / cols);
  const rt = makeTarget(renderer, cols * PITCH_X, rows * PITCH_Y);
  const rtImg = makeTarget(renderer, cols * PITCH_X, rows * PHOTO_Y);

  const black = new THREE.Color(0, 0, 0);
  const saved = new THREE.Color();
  function clear(target) {
    renderer.getClearColor(saved);
    const alpha = renderer.getClearAlpha();
    renderer.setClearColor(black, 1);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.setRenderTarget(null);
    renderer.setClearColor(saved, alpha);
  }
  clear(rt);
  clear(rtImg);
  rt.texture.generateMipmaps = false;
  rtImg.texture.generateMipmaps = false;

  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(0, rt.width, rt.height, 0, -1, 1);
  const photoCam = new THREE.OrthographicCamera(0, rtImg.width, rtImg.height, 0, -1, 1);
  const quadGeo = new THREE.PlaneGeometry(CW, CH);
  const photoGeo = new THREE.PlaneGeometry(CW, IH);
  const quadMat = () => new THREE.ShaderMaterial({ uniforms: { map: { value: null } }, vertexShader: QUAD_VERT, fragmentShader: QUAD_FRAG, depthTest: false, depthWrite: false });
  const sheet = (h) => Array.from({ length: PER_FRAME }, () => {
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = h;
    return c;
  });
  const canvases = sheet(CH);
  const photoCanvases = sheet(IH);

  const slotOf = new Map();
  const itemOf = new Array(cap).fill(-1);
  const used = new Float64Array(cap);
  const ready = new Uint8Array(cap);
  const shown = new Float64Array(cap);
  const queue = [];
  const photoQueue = [];
  const stale = new Set();
  const photos = new Map();
  const lastMip = { mask: 0, photo: 0 };
  let clock = 0;
  let quadReady = false;

  const probe = new THREE.Mesh(quadGeo, quadMat());
  quadScene.add(probe);
  const warmed = () => {
    quadScene.remove(probe);
    quadReady = true;
    onDrawn();
  };
  renderer.compileAsync(quadScene, quadCam).then(warmed, warmed);

  function cell(s) {
    return { x: (s % cols) * PITCH_X + PAD, y: Math.floor(s / cols) * PITCH_Y + PAD };
  }

  function tile(i) {
    const s = slotOf.get(i);
    if (s === undefined || !ready[s]) return null;
    const c = cell(s);
    return [(c.x + 0.5) / rt.width, (c.y + 0.5) / rt.height, (CW - 1) / rt.width, (CH - 1) / rt.height];
  }

  function photo(i) {
    const s = slotOf.get(i);
    return s === undefined ? 0 : shown[s];
  }

  function photoTile(i) {
    const s = slotOf.get(i);
    if (s === undefined || !shown[s]) return null;
    const x = (s % cols) * PITCH_X + PAD;
    const y = Math.floor(s / cols) * PHOTO_Y + PAD;
    return [(x + 0.5) / rtImg.width, (y + 0.5) / rtImg.height, (CW - 1) / rtImg.width, (IH - 1) / rtImg.height];
  }

  function load(i) {
    const url = thumb(items[i].m);
    if (!url || photos.has(i)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    photos.set(i, null);
    img.onload = () => {
      photos.set(i, img);
      const s = slotOf.get(i);
      if (s !== undefined) {
        photoQueue.push(s);
        onDrawn();
      }
    };
    img.onerror = () => photos.set(i, false);
    img.src = url;
  }

  function want(ids) {
    clock++;
    const keep = new Set(ids);
    ids.forEach((i) => {
      if (slotOf.has(i)) {
        used[slotOf.get(i)] = clock;
        return;
      }
      let s = itemOf.indexOf(-1);
      if (s < 0) {
        for (let k = 0; k < cap; k++) if (!keep.has(itemOf[k]) && (s < 0 || used[k] < used[s])) s = k;
        if (s < 0) return;
        slotOf.delete(itemOf[s]);
      }
      itemOf[s] = i;
      slotOf.set(i, s);
      used[s] = clock;
      ready[s] = 0;
      shown[s] = 0;
      queue.push(s);
      if (photos.get(i)) photoQueue.push(s);
      else load(i);
    });
  }

  function blit(target, jobs, key, last, photoPass) {
    const meshes = jobs.map(([s, draw], k) => {
      const c = (photoPass ? photoCanvases : canvases)[k];
      draw(c.getContext('2d'));
      const tex = new THREE.CanvasTexture(c);
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      const mat = quadMat();
      mat.uniforms.map.value = tex;
      const mesh = new THREE.Mesh(photoPass ? photoGeo : quadGeo, mat);
      const x = (s % cols) * PITCH_X + PAD;
      const y = Math.floor(s / cols) * (photoPass ? PHOTO_Y : PITCH_Y) + PAD;
      mesh.position.set(x + CW / 2, y + (photoPass ? IH : CH) / 2, 0);
      quadScene.add(mesh);
      return mesh;
    });
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    const now = performance.now();
    target.texture.generateMipmaps = last || now - lastMip[key] > MIP_EVERY;
    if (target.texture.generateMipmaps) lastMip[key] = now;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, photoPass ? photoCam : quadCam);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAuto;
    meshes.forEach((mesh) => {
      quadScene.remove(mesh);
      mesh.material.uniforms.map.value.dispose();
      mesh.material.dispose();
    });
  }

  function pump() {
    if (!quadReady || (!queue.length && !photoQueue.length)) return false;
    if (queue.length) {
      const batch = [...new Set(queue.splice(0, PER_FRAME))].filter((s) => itemOf[s] >= 0 && (!ready[s] || stale.has(s)));
      blit(rt, batch.map((s) => [s, (g) => drawCard(g, items[itemOf[s]])]), 'mask', !queue.length);
      batch.forEach((s) => {
        ready[s] = 1;
        stale.delete(s);
      });
    } else {
      const batch = [...new Set(photoQueue.splice(0, PER_FRAME))].filter((s) => itemOf[s] >= 0 && photos.get(itemOf[s]));
      blit(rtImg, batch.map((s) => [s, (g) => drawPhoto(g, photos.get(itemOf[s]))]), 'photo', !photoQueue.length, true);
      const now = performance.now();
      batch.forEach((s) => { if (!shown[s]) shown[s] = now; });
    }
    onDrawn();
    return true;
  }

  function reset() {
    clear(rt);
    clear(rtImg);
    ready.fill(0);
    shown.fill(0);
    stale.clear();
    queue.length = 0;
    photoQueue.length = 0;
    itemOf.forEach((i, s) => {
      if (i < 0) return;
      queue.push(s);
      if (photos.get(i)) photoQueue.push(s);
    });
  }

  function refresh(ids) {
    ids.forEach((i) => {
      const s = slotOf.get(i);
      if (s === undefined) return;
      stale.add(s);
      queue.push(s);
    });
  }

  return { image: (i) => photos.get(i) || null, texture: rt.texture, photos: rtImg.texture, tile, photo, photoTile, want, pump, reset, refresh, pending: () => queue.length > 0 || photoQueue.length > 0 };
}

export function createHero() {
  const K = 2;
  const sheet = (h) => {
    const c = document.createElement('canvas');
    c.width = CW * K;
    c.height = h * K;
    return c;
  };
  const mc = sheet(CH);
  const pc = sheet(IH);
  const mask = new THREE.CanvasTexture(mc);
  const photo = new THREE.CanvasTexture(pc);
  mask.anisotropy = photo.anisotropy = 4;
  let item = -1;
  let hasPhoto = false;
  function paint(c, fn) {
    const g = c.getContext('2d');
    g.setTransform(K, 0, 0, K, 0, 0);
    fn(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  function draw(i, it, img) {
    paint(mc, (g) => drawCard(g, it));
    mask.needsUpdate = true;
    hasPhoto = !!img;
    if (img) {
      paint(pc, (g) => drawPhoto(g, img));
      photo.needsUpdate = true;
    }
    item = i;
  }
  return { mask, photo, draw, item: () => item, hasPhoto: () => hasPhoto, restore: () => { mask.needsUpdate = true; photo.needsUpdate = true; } };
}

export function createLabels(onTexture) {
  let texture = null;
  let height = 1;
  let drawerRows = 1;

  function draw(drawers, tags) {
    const ui = cssFont('--font-ui', 'sans-serif');
    const code = cssFont('--font-code', 'monospace');
    const display = cssFont('--font-display', 'serif');
    drawerRows = Math.max(1, Math.ceil(drawers.length / LCOLS));
    const tagRows = Math.max(1, Math.ceil(tags.length / LCOLS));
    height = drawerRows * LH + tagRows * TH;
    const canvas = document.createElement('canvas');
    canvas.width = LCOLS * LW;
    canvas.height = height;
    const g = canvas.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = 'lighter';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    drawers.forEach(({ name, count }, k) => {
      const x = (k % LCOLS) * LW;
      const y = Math.floor(k / LCOLS) * LH;
      g.fillStyle = '#008';
      g.fillRect(x + 43, y + 15, 170, 58);
      g.fillStyle = '#00f';
      g.fillRect(x + 46, y + 18, 164, 52);
      fitFont(g, name, 600, 28, display, 140, 12);
      g.fillStyle = '#f00';
      g.fillText(name, x + LW / 2 + 4, y + 39);
      g.fillStyle = '#0f0';
      g.font = `400 16px ${code}`;
      g.fillText(count, x + LW / 2 + 4, y + 60);
    });
    tags.forEach((name, k) => {
      const x = (k % LCOLS) * TW;
      const y = drawerRows * LH + Math.floor(k / LCOLS) * TH;
      fitFont(g, name, 700, 30, ui, TW - 24, 12);
      g.fillStyle = '#f00';
      g.fillText(name, x + TW / 2, y + TH / 2 + 2);
    });
    const old = texture;
    texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    onTexture(texture);
    if (old) old.dispose();
  }

  function rect(x, y, w, h) {
    return [x / (LCOLS * LW), 1 - (y + h) / height, w / (LCOLS * LW), h / height];
  }

  return {
    draw,
    drawerTile: (k) => rect((k % LCOLS) * LW, Math.floor(k / LCOLS) * LH, LW, LH),
    tagTile: (k) => rect((k % LCOLS) * TW, drawerRows * LH + Math.floor(k / LCOLS) * TH, TW, TH),
    restore: () => { if (texture) texture.needsUpdate = true; },
  };
}
