import * as THREE from 'three';

const CW = 150;
const CH = 225;
const PITCH_X = CW + 4;
const PITCH_Y = CH + 4;
const EM = 12.48;
const PER_FRAME = 12;
const IN_FLIGHT = 8;
const MIP_EVERY = 500;

export function smallCover(u) {
  return u && u.indexOf('//m.media-amazon.com/') > -1 && /\.jpg$/.test(u) ? u.slice(0, -4) + '._SX150_.jpg' : u;
}

export function bigCover(u) {
  return u && u.indexOf('//m.media-amazon.com/') > -1 && /\.jpg$/.test(u) ? u.slice(0, -4) + '._SX400_.jpg' : u;
}

export function displayFont() {
  return getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'serif';
}

export function lang() {
  return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'zh';
}

export function titleOf(b, l = lang()) {
  return l === 'en' ? b.t : (b.tz || b.t);
}

export function authorOf(b, l = lang()) {
  return l === 'en' ? b.a : (b.az || b.a);
}

const isCJK = (ch) => ch.codePointAt(0) >= 0x2e80;

export function wrap(ctx, text, maxW) {
  const lines = [];
  let line = '';
  let lastSpace = -1;
  Array.from(text).forEach((ch) => {
    const next = line + ch;
    if (line && ctx.measureText(next).width > maxW) {
      if (!isCJK(ch) && lastSpace > 0) {
        lines.push(line.slice(0, lastSpace));
        line = line.slice(lastSpace + 1) + ch;
      } else {
        lines.push(line);
        line = ch === ' ' ? '' : ch;
      }
      lastSpace = line.lastIndexOf(' ');
    } else {
      line = next;
      if (ch === ' ') lastSpace = line.length - 1;
    }
  });
  if (line) lines.push(line);
  return lines;
}

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

export function createTextures(gl, books, dims, opts) {
  const renderer = gl.renderer;
  const max = Math.min(renderer.capabilities.maxTextureSize, 4096);
  const n = books.length;

  const cols = Math.max(1, Math.floor(max / PITCH_X));
  const rows = Math.ceil(n / cols);
  const rt = new THREE.WebGLRenderTarget(cols * PITCH_X, rows * PITCH_Y, {
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.setRenderTarget(null);
  rt.texture.generateMipmaps = false;

  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(0, rt.width, rt.height, 0, -1, 1);
  const quadGeo = new THREE.PlaneGeometry(CW, CH);

  const coverState = new Array(n).fill(0);
  const drawn = new Uint8Array(n);
  const queue = [];
  const waiting = [];
  let inFlight = 0;
  let quadReady = false;
  let lastMip = 0;
  let onReady = () => {};

  const quadMat = () => new THREE.ShaderMaterial({ uniforms: { map: { value: null } }, vertexShader: QUAD_VERT, fragmentShader: QUAD_FRAG, depthTest: false, depthWrite: false });
  const probe = new THREE.Mesh(quadGeo, quadMat());
  quadScene.add(probe);
  renderer.compileAsync(quadScene, quadCam).then(() => {
    quadScene.remove(probe);
    quadReady = true;
    onReady();
  });

  function next() {
    while (inFlight < IN_FLIGHT && waiting.length) {
      inFlight++;
      load(waiting.shift());
    }
  }
  function settled() {
    inFlight--;
    next();
  }

  function cell(i) {
    return { x: (i % cols) * PITCH_X + 2, y: Math.floor(i / cols) * PITCH_Y + 2 };
  }

  for (let i = 0; i < n; i++) {
    const c = cell(i);
    gl.setAttr('iCover', i, (c.x + 0.5) / rt.width, (c.y + 0.5) / rt.height, (CW - 1) / rt.width, (CH - 1) / rt.height);
  }

  function fallbackCanvas(i) {
    const b = books[i];
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = CH;
    const g = c.getContext('2d');
    g.fillStyle = b.c || '#888';
    g.fillRect(0, 0, CW, CH);
    const grad = g.createLinearGradient(0, 0, CW * 0.6, CH);
    grad.addColorStop(0, 'rgba(255,255,255,0.16)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, CW, CH);
    g.fillStyle = b.k || '#f7f3ea';
    g.textBaseline = 'top';
    const font = displayFont();
    g.font = `700 16px ${font}`;
    const lines = wrap(g, titleOf(b), CW * 0.76).slice(0, 6);
    lines.forEach((l, k) => g.fillText(l, CW * 0.12, CH * 0.12 + k * 21));
    g.globalAlpha = 0.8;
    g.font = `500 11px ${font}`;
    const au = wrap(g, authorOf(b), CW * 0.76).slice(0, 2);
    au.forEach((l, k) => g.fillText(l, CW * 0.12, CH * 0.88 - (au.length - k) * 15));
    return c;
  }

  function enqueue(i, source) {
    queue.push({ i, source });
    onReady();
  }

  function load(i) {
    const b = books[i];
    if (!b.cv) {
      settled();
      coverState[i] = 2;
      if (opts.fontsReady()) enqueue(i, fallbackCanvas(i));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      settled();
      const done = () => { coverState[i] = 1; enqueue(i, img); };
      if (img.decode) img.decode().then(done, done);
      else done();
    };
    img.onerror = () => {
      if (img.src !== b.cv) {
        img.src = b.cv;
        return;
      }
      settled();
      coverState[i] = 2;
      if (opts.fontsReady()) enqueue(i, fallbackCanvas(i));
    };
    img.src = smallCover(b.cv);
  }

  function pump() {
    if (!queue.length || !quadReady) return false;
    const batch = queue.splice(0, PER_FRAME);
    const used = [];
    batch.forEach(({ i, source }) => {
      const tex = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source);
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      const mat = quadMat();
      mat.uniforms.map.value = tex;
      const mesh = new THREE.Mesh(quadGeo, mat);
      const c = cell(i);
      mesh.position.set(c.x + CW / 2, c.y + CH / 2, 0);
      quadScene.add(mesh);
      used.push(mesh);
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
    used.forEach((mesh) => {
      quadScene.remove(mesh);
      mesh.material.uniforms.map.value.dispose();
      mesh.material.dispose();
    });
    batch.forEach(({ i }) => {
      drawn[i] = 1;
      gl.setState(i, 0, 1);
    });
    return true;
  }

  const spineCanvas = document.createElement('canvas');
  let spineTex = null;

  function packSpines(s) {
    const cellsOut = [];
    let x = 0;
    let y = 0;
    let rowH = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.ceil(dims[i].t * s) + 2;
      const h = Math.ceil(dims[i].h * s) + 2;
      if (x + w > max) {
        x = 0;
        y += rowH;
        rowH = 0;
      }
      cellsOut.push({ x, y, w, h });
      x += w;
      rowH = Math.max(rowH, h);
    }
    return { cells: cellsOut, height: y + rowH };
  }

  let s = Math.min(2.5, Math.max(1.5, opts.density));
  let pack = packSpines(s);
  while (pack.height > max && s > 0.5) {
    s *= 0.9;
    pack = packSpines(s);
  }
  const spineW = max;
  const spineH = Math.ceil(pack.height / 4) * 4;
  pack.cells.forEach((c, i) => {
    gl.setAttr('iSpine', i, (c.x + 1) / spineW, (c.y + 1) / spineH, (dims[i].t * s) / spineW, (dims[i].h * s) / spineH);
  });

  function drawSpine(g, i, c, l, font) {
    const b = books[i];
    const t = dims[i].t * s;
    const h = dims[i].h * s;
    const em = EM * s;
    const avail = h - 1.67 * em;
    const len = l === 'en' ? b.le : b.lz;
    const fs = Math.min(em, Math.max(0.72 * em, avail / ((len || 10) * 1.12)));
    g.font = `600 ${fs.toFixed(2)}px ${font}`;
    const runs = [];
    Array.from(titleOf(b, l)).forEach((ch) => {
      const up = isCJK(ch);
      const last = runs[runs.length - 1];
      if (!up && last && !last.up) last.text += ch;
      else runs.push({ up, text: ch });
    });
    const measure = () => runs.reduce((sum, r) => sum + (r.up ? fs * Array.from(r.text).length : g.measureText(r.text).width), 0);
    let total = measure();
    if (total > avail) {
      while (total > avail && runs.length) {
        const r = runs[runs.length - 1];
        const chars = Array.from(r.text);
        chars.pop();
        if (chars.length) r.text = chars.join('');
        else runs.pop();
        total = measure() + fs;
      }
      const r = runs[runs.length - 1];
      if (r && !r.up) r.text += '…';
      else runs.push({ up: true, text: '⋮' });
      total = measure();
    }
    const cx = c.x + 1 + t / 2;
    let y = c.y + 1 + 0.9 * em + Math.max(0, (avail - total) / 2);
    runs.forEach((r) => {
      if (r.up) {
        g.textAlign = 'center';
        Array.from(r.text).forEach((ch) => {
          g.fillText(ch, cx, y + fs / 2);
          y += fs;
        });
      } else {
        const w = g.measureText(r.text).width;
        g.save();
        g.translate(cx, y);
        g.rotate(Math.PI / 2);
        g.textAlign = 'left';
        g.fillText(r.text, 0, 0);
        g.restore();
        y += w;
      }
    });
  }

  function drawSpines() {
    spineCanvas.width = spineW;
    spineCanvas.height = spineH;
    const g = spineCanvas.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, spineW, spineH);
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    const l = lang();
    const font = displayFont();
    pack.cells.forEach((c, i) => drawSpine(g, i, c, l, font));
    if (!spineTex) {
      spineTex = new THREE.CanvasTexture(spineCanvas);
      spineTex.format = THREE.RedFormat;
      spineTex.flipY = false;
      spineTex.minFilter = THREE.LinearMipmapLinearFilter;
      spineTex.magFilter = THREE.LinearFilter;
      spineTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      gl.setTextures(rt.texture, spineTex);
    }
    spineTex.onUpdate = () => {
      spineCanvas.width = spineCanvas.height = 1;
    };
    spineTex.needsUpdate = true;
    for (let i = 0; i < n; i++) gl.setState(i, 3, 1);
  }

  function redrawFallbacks() {
    for (let i = 0; i < n; i++) if (coverState[i] === 2) enqueue(i, fallbackCanvas(i));
  }

  return {
    covers: rt.texture,
    start(order, ready) {
      onReady = ready;
      waiting.push(...order);
      next();
    },
    pump,
    drawn: (i) => drawn[i] === 1 || coverState[i] === 2,
    fontsChanged() {
      drawSpines();
      redrawFallbacks();
    },
    get queued() {
      return queue.length;
    },
  };
}

export function drawBack(b, w, h, t) {
  const S = 4;
  const cw = Math.round(w * S);
  const ch = Math.round(h * S);
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d');
  g.fillStyle = b.c || '#888';
  g.fillRect(0, 0, cw, ch);
  const grad = g.createLinearGradient(0, 0, cw * 0.5, ch);
  grad.addColorStop(0, 'rgba(255,255,255,0.12)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, cw, ch);
  const em = 13.6 * S;
  const padX = 1.1 * em;
  const maxW = cw - 2 * padX;
  const display = displayFont();
  const ui = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim() || 'sans-serif';
  const l = lang();
  g.fillStyle = b.k || '#f7f3ea';
  g.textBaseline = 'top';
  let y = 1.2 * em;
  const para = (text, font, size, lh, alpha) => {
    if (!text) return;
    g.font = `${font.replace('%', (size * em).toFixed(1) + 'px')}`;
    g.globalAlpha = alpha;
    wrap(g, text, maxW).slice(0, 5).forEach((line) => {
      g.fillText(line, padX, y);
      y += size * em * lh;
    });
    g.globalAlpha = 1;
  };
  para(titleOf(b, l), `700 % ${display}`, 1.25, 1.3, 1);
  const other = l === 'en' ? b.tz : b.t;
  if (b.tz && b.tz !== b.t) {
    y += 0.2 * em;
    para(other, `400 % ${ui}`, 1, 1.45, 0.8);
  }
  y += 0.2 * em;
  para(authorOf(b, l), `400 % ${ui}`, 1, 1.45, 0.8);
  y += 0.75 * em;
  g.globalAlpha = 0.22;
  g.fillRect(padX, y, maxW, S);
  g.globalAlpha = 1;
  y += 0.75 * em + S;
  if (b.d) {
    para(t('books.log'), `400 % ${ui}`, 0.88, 1.45, 0.7);
    y += 0.1 * em;
    para(t('books.read_in', b.d.slice(0, 4)), `400 % ${ui}`, 1, 1.45, 1);
    if (b.n > 1) para(t('books.read_times', b.n), `400 % ${ui}`, 1, 1.45, 1);
  }
  if (b.p) {
    g.font = `400 ${(0.9 * em).toFixed(1)}px ${ui}`;
    g.globalAlpha = 0.8;
    g.textBaseline = 'alphabetic';
    g.fillText(t('books.pages', b.p), padX, ch - 1.4 * em);
    g.globalAlpha = 1;
  }
  return c;
}

export function loadFonts(books) {
  const font = displayFont();
  const sample = books.map((b) => (b.tz || '') + (b.az || '')).join('') + 'AaBbCc…';
  return Promise.all([
    document.fonts.load(`600 16px ${font}`, sample),
    document.fonts.load(`700 16px ${font}`, sample),
    document.fonts.load(`600 16px ${font}`, 'The Quick Brown Fox'),
  ]).catch(() => {});
}
