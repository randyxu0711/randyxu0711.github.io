import * as THREE from 'three';
import { wrap, clampLines } from 'scene3d/text.js';
import { mainName } from 'shares3d/layout.js';

const CW = 320;
const CH = 192;
const PAD = 2;
const PITCH_X = CW + 2 * PAD;
const PITCH_Y = CH + 2 * PAD;
const PER_FRAME = 6;
const MAX_TILES = 120;
const MIP_EVERY = 500;
const LW = 256;
const LH = 128;
const LCOLS = 8;
const PW = 512;
const PH = 64;
const PCOLS = 4;
const PROWS = 3;

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
    document.fonts.load(`400 16px ${cssFont('--font-code', 'monospace')}`, 'Aa0123.-·'),
    document.fonts.load(`700 16px ${cssFont('--font-ui', 'sans-serif')}`, 'AaBb中文分類'),
  ]).catch(() => {});
  return Promise.race([all, new Promise((r) => setTimeout(r, 3000))]);
}

function drawCard(g, it) {
  const k = CW / 640;
  const display = cssFont('--font-display', 'serif');
  const code = cssFont('--font-code', 'monospace');
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#000';
  g.fillRect(0, 0, CW, CH);
  g.globalCompositeOperation = 'lighter';
  g.textBaseline = 'top';
  g.textAlign = 'left';
  g.fillStyle = '#0f0';
  g.font = `400 ${21 * k}px ${code}`;
  g.fillText(it.s, 28 * k, 36 * k);
  g.textAlign = 'right';
  g.fillText(it.d, CW - 28 * k, 36 * k);
  g.textAlign = 'left';
  g.fillStyle = '#f00';
  g.font = `600 ${29 * k}px ${display}`;
  clampLines(g, wrap(g, it.t, 350 * k), 5, 350 * k).forEach((l, n) => g.fillText(l, 28 * k, (125 + 38 * n) * k));
  g.fillStyle = '#0f0';
  g.font = `400 ${19 * k}px ${code}`;
  g.textBaseline = 'alphabetic';
  g.fillText(it.g.join(' · '), 28 * k, CH - 24 * k);
  const name = mainName(it.s);
  g.save();
  g.translate(500 * k, 214 * k);
  g.rotate(-0.14);
  g.strokeStyle = '#00f';
  g.fillStyle = '#00f';
  g.lineWidth = 5 * k;
  g.beginPath();
  g.arc(0, 0, 71.5 * k, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2 * k;
  g.beginPath();
  g.arc(0, 0, 63 * k, 0, Math.PI * 2);
  g.stroke();
  g.textAlign = 'center';
  g.font = `600 ${64 * k}px ${display}`;
  g.fillText((Array.from(name)[0] || '?').toUpperCase(), 0, 14 * k);
  g.font = `400 ${15 * k}px ${code}`;
  g.fillText(name.slice(0, 10).toUpperCase(), 0, 40 * k);
  g.restore();
  g.globalCompositeOperation = 'source-over';
}

export function createAtlas(gl, items, onDrawn) {
  const renderer = gl.renderer;
  const max = Math.min(renderer.capabilities.maxTextureSize, 4096);
  const cols = Math.max(1, Math.floor(max / PITCH_X));
  const cap = Math.max(1, Math.min(items.length, MAX_TILES, cols * Math.floor(max / PITCH_Y)));
  const rows = Math.ceil(cap / cols);
  const rt = new THREE.WebGLRenderTarget(cols * PITCH_X, rows * PITCH_Y, {
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });

  const black = new THREE.Color(0, 0, 0);
  const saved = new THREE.Color();
  function clear() {
    renderer.getClearColor(saved);
    const alpha = renderer.getClearAlpha();
    renderer.setClearColor(black, 1);
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.setRenderTarget(null);
    renderer.setClearColor(saved, alpha);
  }
  clear();
  rt.texture.generateMipmaps = false;

  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(0, rt.width, rt.height, 0, -1, 1);
  const quadGeo = new THREE.PlaneGeometry(CW, CH);
  const quadMat = () => new THREE.ShaderMaterial({ uniforms: { map: { value: null } }, vertexShader: QUAD_VERT, fragmentShader: QUAD_FRAG, depthTest: false, depthWrite: false });
  const canvases = Array.from({ length: PER_FRAME }, () => {
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = CH;
    return c;
  });

  const slotOf = new Map();
  const itemOf = new Array(cap).fill(-1);
  const used = new Float64Array(cap);
  const ready = new Uint8Array(cap);
  const queue = [];
  let clock = 0;
  let lastMip = 0;
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
      queue.push(s);
    });
  }

  function pump() {
    if (!queue.length || !quadReady) return false;
    const batch = [...new Set(queue.splice(0, PER_FRAME))].filter((s) => itemOf[s] >= 0 && !ready[s]);
    const meshes = batch.map((s, k) => {
      const c = canvases[k];
      drawCard(c.getContext('2d'), items[itemOf[s]]);
      const tex = new THREE.CanvasTexture(c);
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      const mat = quadMat();
      mat.uniforms.map.value = tex;
      const mesh = new THREE.Mesh(quadGeo, mat);
      const p = cell(s);
      mesh.position.set(p.x + CW / 2, p.y + CH / 2, 0);
      quadScene.add(mesh);
      return mesh;
    });
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    const now = performance.now();
    rt.texture.generateMipmaps = !queue.length || now - lastMip > MIP_EVERY;
    if (rt.texture.generateMipmaps) lastMip = now;
    renderer.setRenderTarget(rt);
    renderer.render(quadScene, quadCam);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAuto;
    meshes.forEach((mesh) => {
      quadScene.remove(mesh);
      mesh.material.uniforms.map.value.dispose();
      mesh.material.dispose();
    });
    batch.forEach((s) => { ready[s] = 1; });
    onDrawn();
    return true;
  }

  function reset() {
    clear();
    ready.fill(0);
    queue.length = 0;
    itemOf.forEach((i, s) => { if (i >= 0) queue.push(s); });
  }

  return { texture: rt.texture, tile, want, pump, reset, pending: () => queue.length > 0 };
}

export function createLabels(onTexture) {
  let texture = null;
  let height = 1;
  let drawerRows = 1;

  function draw(drawers, piles) {
    const ui = cssFont('--font-ui', 'sans-serif');
    const code = cssFont('--font-code', 'monospace');
    drawerRows = Math.max(1, Math.ceil(drawers.length / LCOLS));
    height = drawerRows * LH + PROWS * PH;
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
      g.strokeStyle = '#0f0';
      g.lineWidth = 4;
      g.strokeRect(x + 46, y + 16, 164, 54);
      let fs = 28;
      g.font = `700 ${fs}px ${ui}`;
      while (g.measureText(name).width > 148 && fs > 12) {
        fs -= 1;
        g.font = `700 ${fs}px ${ui}`;
      }
      g.fillStyle = '#f00';
      g.fillText(name, x + LW / 2, y + 44);
      g.fillStyle = '#0f0';
      g.font = `400 20px ${code}`;
      g.fillText(count, x + LW / 2, y + 88);
    });
    piles.forEach((text, k) => {
      const x = (k % PCOLS) * PW;
      const y = drawerRows * LH + Math.floor(k / PCOLS) * PH;
      g.fillStyle = '#f00';
      g.font = `400 30px ${code}`;
      g.fillText(text, x + PW / 2, y + PH / 2);
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
    pileTile: (k) => rect((k % PCOLS) * PW, drawerRows * LH + Math.floor(k / PCOLS) * PH, PW, PH),
    restore: () => { if (texture) texture.needsUpdate = true; },
  };
}
