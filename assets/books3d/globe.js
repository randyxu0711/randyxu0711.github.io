import * as THREE from 'three';
import { decode, area, dirOf, toPixel, distAt, zoomAt, screenPx, zoomFor, clickAction, cull, ranking, nearestAngle, contains, classOf, SMALL, FLY_TO_PX, STEPS } from 'books3d/geo.js';
import { readTokens } from 'scene3d/colors.js';
import { approach, clamp, lerp, easeInOut } from 'scene3d/anim.js';

const TW = 4096;
const TH = 2048;
const NEAR = 1.55;
const FOV = 30;
const TAN = Math.tan((FOV / 2) * Math.PI / 180);
const TURN = 1100;
const RING = 1.07;
const DOT = 13;
const LIFT = 0.022;
const NIGHT_DARK = 0.565;
const TOKENS = ['globe-sea', 'globe-land', 'globe-grid', 'globe-table', 'brass', 'wood', 'edge', 'desk', 'map-1', 'map-2', 'map-3', 'map-4', 'map-5'];
const RAW = ['globe-sea', 'globe-land', 'globe-line', 'globe-grid', 'edge', 'map-1', 'map-2', 'map-3', 'map-4', 'map-5'];

const css = (c) => 'rgb(' + c.slice(0, 3).map((v) => Math.round(v * 255)).join(' ') + ')';
const dark = (c, k) => [c[0] * k, c[1] * k, c[2] * k, 1];

export async function createGlobe({ renderer, shelfCamera, books, geo, atlas, root, t, lang, reduce, onShelf, onClosed, invalidate }) {
  const topo = await (await fetch(atlas)).json();
  const shapes = decode(topo);
  const ranks = ranking(books, (k) => k);
  const total = ranks.reduce((s, r) => s + r.count, 0);
  const C = new Map();
  ranks.forEach((r) => {
    const g = geo.countries[r.country];
    const polys = g && shapes.get(g.topo);
    if (!polys) return;
    const a = area(polys);
    C.set(r.country, { ...r, g, polys, area: a, small: a < SMALL, dir: new THREE.Vector3(...dirOf(g.at[0], g.at[1])) });
  });
  const sub = new Map(geo.subregions.map((s) => [s.id, s]));
  const conts = geo.continents.map((c) => {
    const list = [...C.values()].filter((x) => (sub.get(x.g.subregion) || {}).continent === c.id);
    const dir = list.reduce((v, x) => v.addScaledVector(x.dir, x.count), new THREE.Vector3()).normalize();
    return { ...c, list, dir, count: list.reduce((s, x) => s + x.count, 0) };
  }).filter((c) => c.list.length);
  const nameOf = (k) => (lang() === 'zh' ? C.get(k).g.zh : k);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 300);
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xc8b89c, 1.6);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 40 });
  const key = new THREE.SpotLight(0xffd6a6, 0, 0, 0.42, 0.75, 0);
  key.position.set(0, 4.2, 2.2);
  key.target.position.set(0, -0.4, 0);
  const glow = new THREE.PointLight(0xffc690, 0, 10, 1.2);
  glow.position.set(0, 2.2, -1.8);
  scene.add(hemi, sun, sun.target, key, key.target, glow);

  const canvas2d = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const mapC = canvas2d(TW, TH);
  const emitC = canvas2d(TW / 2, TH / 2);
  const topC = canvas2d(TW, TH);
  const topEmitC = canvas2d(TW / 2, TH / 2);
  const dropC = canvas2d(TW / 2, TH / 2);
  const tex = (c) => {
    const x = new THREE.CanvasTexture(c);
    x.anisotropy = 8;
    return x;
  };
  const mapT = tex(mapC);
  const emitT = tex(emitC);
  const topT = tex(topC);
  const topEmitT = tex(topEmitC);
  const dropT = tex(dropC);

  const root3 = new THREE.Group();
  const spin = new THREE.Group();
  scene.add(root3);
  root3.add(spin);
  const sphere = new THREE.SphereGeometry(1, 128, 96);
  const ballMat = new THREE.MeshStandardMaterial({ map: mapT, emissiveMap: emitT, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.62 });
  const ball = new THREE.Mesh(sphere, ballMat);
  ball.castShadow = true;
  spin.add(ball);

  const topMat = new THREE.MeshStandardMaterial({ map: topT, emissiveMap: topEmitT, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.65, transparent: true, alphaTest: 0.5 });
  const top = new THREE.Mesh(sphere, topMat);
  const dropMat = new THREE.MeshBasicMaterial({ map: dropT, transparent: true, depthWrite: false, opacity: 0 });
  const drop = new THREE.Mesh(sphere, dropMat);
  drop.scale.setScalar(1.0008);
  const wallGeo = new THREE.BufferGeometry();
  const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.65, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0 });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  top.visible = drop.visible = walls.visible = false;
  walls.frustumCulled = false;
  spin.add(drop, top, walls);

  const brass = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const table = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const wallM = new THREE.MeshStandardMaterial({ roughness: 1, emissive: 0xffffff, emissiveIntensity: 0 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RING, 0.016, 10, 160, Math.PI * 1.25), brass);
  ring.rotation.z = -Math.PI / 2 - 0.35;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.3, 16), wood);
  post.position.y = -RING - 0.13;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.53, 0.12, 48), wood);
  base.position.y = -RING - 0.32;
  base.castShadow = true;
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 2.0), table);
  desk.position.y = -RING - 0.42;
  desk.receiveShadow = true;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 400), wallM);
  wall.position.z = -3;
  wall.receiveShadow = true;
  root3.add(ring, post, base, desk, wall);

  let tok = {};
  let raw = {};
  let night = false;
  const ramp = (k, glowing) => (glowing ? tok['map-' + (k + 1)] : night ? dark(tok['map-' + (k + 1)], NIGHT_DARK) : tok['map-' + (k + 1)]);

  function trace(g, polys, sx) {
    g.beginPath();
    [-TW, 0, TW].forEach((off) => polys.forEach((rings) => rings.forEach((r) => {
      r.forEach(([lon, lat], k) => {
        const [x, y] = toPixel(lon, lat, TW, TH);
        if (k) g.lineTo((x + off) * sx, y * sx);
        else g.moveTo((x + off) * sx, y * sx);
      });
      g.closePath();
    })));
  }
  function dot(g, c, sx, r) {
    const [x, y] = toPixel(c.g.at[0], c.g.at[1], TW, TH);
    g.moveTo((x + r) * sx, y * sx);
    g.arc(x * sx, y * sx, r * sx, 0, Math.PI * 2);
  }

  function paint() {
    const g = mapC.getContext('2d');
    const e = emitC.getContext('2d');
    g.fillStyle = raw['globe-sea'];
    g.fillRect(0, 0, TW, TH);
    e.fillStyle = '#2b2219';
    e.fillRect(0, 0, TW / 2, TH / 2);
    g.beginPath();
    for (let lon = -180; lon <= 180; lon += 15) {
      g.moveTo(toPixel(lon, 0, TW, TH)[0], 0);
      g.lineTo(toPixel(lon, 0, TW, TH)[0], TH);
    }
    for (let lat = -75; lat <= 75; lat += 15) {
      g.moveTo(0, toPixel(0, lat, TW, TH)[1]);
      g.lineTo(TW, toPixel(0, lat, TW, TH)[1]);
    }
    g.strokeStyle = raw['globe-grid'];
    g.lineWidth = 2;
    g.stroke();
    shapes.forEach((polys) => {
      trace(g, polys, 1);
      g.fillStyle = raw['globe-land'];
      g.fill('evenodd');
      trace(e, polys, 0.5);
      e.fillStyle = '#3d3226';
      e.fill('evenodd');
    });
    C.forEach((c) => {
      trace(g, c.polys, 1);
      if (c.small) dot(g, c, 1, DOT);
      g.fillStyle = css(ramp(c.cls));
      g.fill('evenodd');
      trace(e, c.polys, 0.5);
      if (c.small) dot(e, c, 0.5, DOT);
      e.fillStyle = css(ramp(c.cls, true));
      e.fill('evenodd');
    });
    g.strokeStyle = raw['globe-line'];
    g.lineWidth = 1.6;
    shapes.forEach((polys) => {
      trace(g, polys, 1);
      g.stroke();
    });
    mapT.needsUpdate = true;
    emitT.needsUpdate = true;
  }

  let lifted = [];
  function paintLift() {
    const g = topC.getContext('2d');
    const e = topEmitC.getContext('2d');
    const d = dropC.getContext('2d');
    g.clearRect(0, 0, TW, TH);
    e.clearRect(0, 0, TW / 2, TH / 2);
    d.clearRect(0, 0, TW / 2, TH / 2);
    d.filter = 'blur(4px)';
    d.fillStyle = night ? 'rgba(0,0,0,.7)' : 'rgba(60,35,20,.45)';
    lifted.forEach((k) => {
      const c = C.get(k);
      trace(g, c.polys, 1);
      if (c.small) dot(g, c, 1, DOT * 1.3);
      g.fillStyle = css(ramp(c.cls));
      g.fill('evenodd');
      g.strokeStyle = raw.edge;
      g.lineWidth = 5;
      g.stroke();
      trace(e, c.polys, 0.5);
      if (c.small) dot(e, c, 0.5, DOT * 1.3);
      e.fillStyle = css(ramp(c.cls, true));
      e.fill('evenodd');
      d.save();
      d.translate(2.5, 3.5);
      trace(d, c.polys, 0.5);
      if (c.small) dot(d, c, 0.5, DOT * 1.3);
      d.fill('evenodd');
      d.restore();
    });
    d.filter = 'none';
    topT.needsUpdate = topEmitT.needsUpdate = dropT.needsUpdate = true;
    buildWalls();
  }

  let wallBase = new Float32Array(0);
  let wallTop = new Uint8Array(0);
  function buildWalls() {
    const pts = [];
    const tops = [];
    const add = (a, b) => {
      const p = dirOf(a[0], a[1]);
      const q = dirOf(b[0], b[1]);
      [[p, 0], [q, 0], [q, 1], [p, 0], [q, 1], [p, 1]].forEach(([v, up]) => {
        pts.push(...v);
        tops.push(up);
      });
    };
    lifted.forEach((k) => {
      const c = C.get(k);
      const rings = c.small ? [circle(c.g.at, (DOT * 1.3 * 360) / TW)] : c.polys.flat();
      rings.forEach((r) => {
        for (let i = 0; i < r.length - 1; i++) {
          const a = r[i];
          const b = r[i + 1];
          const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
          for (let s = 0; s < steps; s++) add([lerp(a[0], b[0], s / steps), lerp(a[1], b[1], s / steps)], [lerp(a[0], b[0], (s + 1) / steps), lerp(a[1], b[1], (s + 1) / steps)]);
        }
      });
    });
    wallBase = new Float32Array(pts);
    wallTop = new Uint8Array(tops);
    wallGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts.length), 3));
    setWalls(1);
  }
  function circle([lon, lat], r) {
    const out = [];
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      out.push([lon + (r * Math.cos(a)) / Math.cos(lat * Math.PI / 180), lat + r * Math.sin(a)]);
    }
    return out;
  }
  function setWalls(s) {
    const pos = wallGeo.getAttribute('position');
    if (!pos) return;
    for (let i = 0; i < wallTop.length; i++) {
      const k = wallTop[i] ? s : 1;
      pos.array[i * 3] = wallBase[i * 3] * k;
      pos.array[i * 3 + 1] = wallBase[i * 3 + 1] * k;
      pos.array[i * 3 + 2] = wallBase[i * 3 + 2] * k;
    }
    pos.needsUpdate = true;
    wallGeo.computeVertexNormals();
  }

  function colors(isNight) {
    night = isNight;
    tok = readTokens(TOKENS);
    const cs = getComputedStyle(document.documentElement);
    RAW.forEach((k) => { raw[k] = cs.getPropertyValue('--' + k).trim() || '#808080'; });
    raw.edge = raw.edge || css(tok.edge);
    brass.color.setRGB(...tok.brass.slice(0, 3));
    brass.roughness = night ? 0.4 : 0.35;
    brass.metalness = night ? 0.55 : 0.6;
    wood.color.setRGB(...tok.wood.slice(0, 3));
    wood.roughness = night ? 0.4 : 0.6;
    table.color.setRGB(...tok['globe-table'].slice(0, 3));
    wallM.color.setRGB(...tok.desk.slice(0, 3));
    wallM.emissive.setRGB(...tok.desk.slice(0, 3));
    wallM.emissiveIntensity = night ? 0.22 : 0.3;
    wallMat.color.setRGB(...tok.edge.slice(0, 3));
    wallMat.emissive.setRGB(...tok.edge.slice(0, 3));
    wallMat.emissiveIntensity = night ? 0.5 : 0;
    ballMat.emissiveIntensity = topMat.emissiveIntensity = night ? 0.8 : 0;
    hemi.intensity = night ? 1.3 : 2.6;
    sun.intensity = night ? 0.1 : 1.4;
    sun.castShadow = !night;
    key.intensity = night ? 3 : 0;
    glow.intensity = night ? 7 : 0;
    paint();
    paintLift();
    invalidate();
  }

  const labels = document.createElement('div');
  labels.className = 'b3d-labels';
  labels.setAttribute('aria-hidden', 'true');
  const tip = document.createElement('div');
  tip.className = 'b3d-gtip';
  tip.hidden = true;
  const hit = document.createElement('div');
  hit.className = 'b3d-globe';
  hit.hidden = true;
  const card = document.createElement('aside');
  card.className = 'b3d-map';
  card.id = 'b3d-map';
  card.hidden = true;
  root.append(hit, labels, tip, card);

  const labelEls = new Map();
  const mkLabel = (id, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.tabIndex = -1;
    b.className = 'b3d-lab ' + cls;
    b.dataset.id = id;
    labels.appendChild(b);
    labelEls.set(id, { el: b, w: 0, h: 0 });
    return b;
  };
  C.forEach((c, k) => mkLabel(k, ''));
  conts.forEach((c) => mkLabel('@' + c.id, 'cont'));

  function text() {
    C.forEach((c, k) => { labelEls.get(k).el.innerHTML = esc(nameOf(k)) + '<b>' + c.count + '</b>'; });
    conts.forEach((c) => { labelEls.get('@' + c.id).el.textContent = c[lang()] || c.en; });
    labelEls.forEach((l) => { l.w = 0; });
    card.setAttribute('aria-label', t('books3d.map_title'));
    const steps = STEPS.map((s, k) => (k === STEPS.length - 1 ? s + '+' : s === STEPS[k + 1] - 1 ? String(s) : s + '–' + (STEPS[k + 1] - 1)));
    card.innerHTML = '<div class="b3d-map-head"><h2>' + esc(t('books3d.map_title')) + '</h2><span>' + esc(t('books3d.map_countries', C.size)) + '</span></div>'
      + '<div class="b3d-ramp"><i class="none"></i><b></b>' + STEPS.map((s, k) => '<i style="--c:var(--map-' + (k + 1) + ')"></i>').join('') + '</div>'
      + '<div class="b3d-ramp n"><span>' + esc(t('books3d.map_none')) + '</span><b></b>' + steps.map((s) => '<span>' + s + '</span>').join('') + '</div>'
      + '<div class="b3d-rank-wrap"><ol class="b3d-rank">' + [...C.values()].map((c) => '<li><button type="button" data-k="' + esc(c.country) + '" aria-label="' + esc(nameOf(c.country) + ', ' + t('books.count', c.count)) + '"><i style="--c:var(--map-' + (c.cls + 1) + ')"></i><span class="nm">' + esc(nameOf(c.country)) + '</span><span class="ct">' + c.count + '</span></button></li>').join('') + '</ol><i class="b3d-thumb" aria-hidden="true"></i></div>'
      + '<div class="b3d-map-foot">' + esc(t('books3d.map_total', total)) + '</div>';
    rank = card.querySelector('.b3d-rank');
    rank.addEventListener('scroll', scrollThumb, { passive: true });
    requestAnimationFrame(scrollThumb);
    markRows();
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  let rank = null;
  function scrollThumb() {
    if (!rank) return;
    const wrap = rank.parentElement;
    const th = wrap.querySelector('.b3d-thumb');
    const ch = rank.clientHeight;
    const sh = rank.scrollHeight;
    const st = rank.scrollTop;
    wrap.classList.toggle('scrolls', sh > ch + 1);
    const h = Math.max(18, (ch * ch) / sh);
    th.style.height = h + 'px';
    th.style.transform = 'translateY(' + ((ch - h) * st) / Math.max(1, sh - ch) + 'px)';
    rank.style.setProperty('--ft', st > 2 ? '1rem' : '0px');
    rank.style.setProperty('--fb', st < sh - ch - 2 ? '1.4rem' : '0px');
  }
  function markRows() {
    if (!rank) return;
    rank.querySelectorAll('button').forEach((b) => b.classList.toggle('on', lifted.length === 1 && lifted[0] === b.dataset.k));
  }

  const S = { mode: 'off', p: 0, t0: 0, G: new THREE.Vector3(), R: 1, yaw: 0, tilt: 0, yawT: 0, tiltT: 0, vel: 0, z: 0, zT: 0, h: 0 };
  let hover = null;
  const far = () => Math.max((RING + 0.5) / 0.82 / TAN, 1.25 / 0.94 / (TAN * aspect()));
  const aspect = () => window.innerWidth / Math.max(1, window.innerHeight);
  const dist = () => distAt(S.z, 1, NEAR, far());

  function face(dir) {
    const v = dir;
    const yaw = Math.atan2(-v.x, v.z);
    const tilt = Math.atan2(v.y, Math.hypot(v.x, v.z));
    S.yawT = nearestAngle(S.yaw, yaw);
    S.tiltT = tilt;
    S.vel = 0;
  }
  const tiltMax = (z) => 0.45 + 0.8 * z;

  function setLift(list) {
    const key = list.join('|');
    if (key === lifted.join('|')) return;
    lifted = list;
    paintLift();
    markRows();
    invalidate();
  }

  function open(G, R) {
    S.G.copy(G);
    S.R = R;
    if (S.mode === 'off') {
      S.yaw = S.yawT = 0;
      S.tilt = S.tiltT = 0;
      face(new THREE.Vector3(...dirOf(-35, 38)));
      S.yaw = S.yawT;
      S.tilt = S.tiltT = clamp(S.tiltT, -tiltMax(0), tiltMax(0));
      S.z = S.zT = 0;
    }
    S.mode = 'in';
    S.t0 = performance.now();
    S.from = S.p;
    hit.hidden = false;
    invalidate();
  }

  function close(then) {
    if (S.mode === 'off' || S.mode === 'out') return;
    setLift([]);
    hover = null;
    tip.hidden = true;
    S.mode = 'out';
    S.t0 = performance.now();
    S.from = S.p;
    S.then = then || null;
    hit.hidden = true;
    card.hidden = true;
    labels.classList.remove('on');
    invalidate();
  }

  const qR = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const qRi = qR.clone().invert();
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _m = new THREE.Matrix4();
  const target = new THREE.PerspectiveCamera(FOV, 1, 0.05, 300);

  function sceneCam(e) {
    const ly = -0.2 * (1 - S.z);
    target.aspect = aspect();
    target.position.set(0, ly, dist());
    target.quaternion.identity();
    target.near = 0.05;
    target.far = 300;
    target.updateProjectionMatrix();
    const sc = shelfCamera();
    _p.copy(sc.position).sub(S.G).divideScalar(S.R).applyQuaternion(qR);
    camera.position.lerpVectors(_p, target.position, e);
    _q.copy(qR);
    camera.quaternion.slerpQuaternions(_q, target.quaternion, e);
    const a = sc.projectionMatrix.elements;
    const b = target.projectionMatrix.elements;
    const out = camera.projectionMatrix.elements;
    for (let k = 0; k < 16; k++) out[k] = lerp(a[k], b[k], e);
    out[10] = b[10];
    out[14] = b[14];
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.updateMatrixWorld();
    _p.copy(camera.position).applyQuaternion(qRi).multiplyScalar(S.R).add(S.G);
    sc.position.copy(_p);
    sc.quaternion.copy(qRi).multiply(camera.quaternion);
    const sa = sc.projectionMatrix.elements;
    for (let k = 0; k < 16; k++) if (k !== 10 && k !== 14) sa[k] = out[k];
    sc.projectionMatrixInverse.copy(sc.projectionMatrix).invert();
    sc.updateMatrixWorld();
  }

  function frame(now, dt) {
    let busy = false;
    if (S.mode === 'in' || S.mode === 'out') {
      const k = reduce.matches ? 1 : clamp((now - S.t0) / TURN, 0, 1);
      S.p = lerp(S.from, S.mode === 'in' ? 1 : 0, k);
      if (k >= 1) {
        if (S.mode === 'in') {
          S.mode = 'on';
          card.hidden = false;
          labels.classList.add('on');
          scrollThumb();
        } else {
          S.mode = 'off';
          const sc = shelfCamera();
          sc.quaternion.identity();
          sc.updateMatrixWorld();
          const then = S.then;
          S.then = null;
          onClosed(then);
        }
      }
      busy = true;
    }
    if (S.mode === 'off') return false;
    const r = (rate) => (reduce.matches ? 1 : 1 - Math.exp(-dt * rate));
    if (!drag && S.vel && !reduce.matches) {
      S.yawT += S.vel * dt * 60;
      S.vel *= Math.pow(0.88, dt * 60);
      if (Math.abs(S.vel) < 1e-4) S.vel = 0;
      busy = true;
    }
    S.tiltT = clamp(S.tiltT, -tiltMax(S.zT), tiltMax(S.zT));
    [['yaw', 'yawT'], ['tilt', 'tiltT'], ['z', 'zT']].forEach(([a, b]) => {
      if (S[a] === S[b]) return;
      S[a] += (S[b] - S[a]) * r(4.2);
      if (Math.abs(S[a] - S[b]) < 1e-4) S[a] = S[b];
      busy = true;
    });
    const hT = lifted.length ? LIFT - 0.01 * S.z : 0;
    if (S.h !== hT) {
      S.h += (hT - S.h) * r(14);
      if (Math.abs(S.h - hT) < 1e-5) S.h = hT;
      busy = true;
    }
    const shown = S.h > 1e-4 && lifted.length;
    top.visible = drop.visible = walls.visible = !!shown;
    if (shown) {
      top.scale.setScalar(1 + S.h);
      setWalls(1 + S.h);
      dropMat.opacity = clamp(S.h / LIFT, 0, 1);
    }
    spin.rotation.set(S.tilt, S.yaw, 0, 'XYZ');
    const e = easeInOut(S.p);
    sceneCam(e);
    if (S.mode === 'on' && pointer.in && pointer.moved && !drag) {
      pointer.moved = false;
      hoverAt(pointer.x, pointer.y);
    }
    placeLabels(e);
    return busy;
  }

  function render(shelf) {
    const auto = renderer.autoClear;
    if (S.p < 1) {
      shelf();
      renderer.autoClear = false;
      renderer.clearDepth();
    }
    renderer.render(scene, camera);
    renderer.autoClear = auto;
  }

  const _v = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _c = new THREE.Vector3();
  function project(dir) {
    _n.copy(dir).applyQuaternion(spin.quaternion);
    _v.copy(_n);
    _c.copy(camera.position).sub(_v).normalize();
    const facing = _n.dot(_c);
    _v.project(camera);
    return { facing, x: (_v.x + 1) / 2 * window.innerWidth, y: (1 - _v.y) / 2 * window.innerHeight };
  }

  function placeLabels(e) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const list = [];
    const on = S.mode === 'on';
    labelEls.forEach((l, id) => {
      const cont = id[0] === '@';
      const src = cont ? conts.find((c) => '@' + c.id === id) : C.get(id);
      const p = project(src.dir);
      const ok = on && e > 0.99 && (cont ? p.facing > 0.6 && S.z < 0.35 : p.facing > 0.3);
      l.p = p;
      if (!ok) return;
      if (!l.w) {
        l.w = l.el.offsetWidth;
        l.h = l.el.offsetHeight;
      }
      list.push({ id, x: p.x, y: p.y, w: l.w, h: l.h, score: cont ? 0.5 : src.count, vw, vh });
    });
    const keep = new Set(cull(list).map((x) => x.id));
    labelEls.forEach((l, id) => {
      const show = keep.has(id);
      l.el.classList.toggle('off', !show);
      if (show) l.el.style.transform = 'translate(' + (l.p.x - l.w / 2).toFixed(1) + 'px,' + (l.p.y - l.h / 2).toFixed(1) + 'px)';
      l.el.classList.toggle('lit', !!(lifted.length && (id[0] === '@' ? false : lifted.includes(id))));
    });
    if (hover && !keep.has(hover)) {
      const p = labelEls.get(hover).p;
      tip.innerHTML = '<b>' + esc(nameOf(hover)) + '</b> <span>' + esc(t('books.count', C.get(hover).count)) + '</span>';
      tip.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px)';
      tip.hidden = false;
    } else tip.hidden = true;
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pickAt(x, y) {
    ndc.set((x / window.innerWidth) * 2 - 1, 1 - (y / window.innerHeight) * 2);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObject(ball, false)[0];
    if (!h) return { ball: false, k: null };
    const lon = h.uv.x * 360 - 180;
    const lat = h.uv.y * 180 - 90;
    const dotR = (DOT * 1.3 * 360) / TW;
    for (const [k, c] of C) {
      if (c.small && Math.hypot((lon - c.g.at[0]) * Math.cos(lat * Math.PI / 180), lat - c.g.at[1]) < dotR) return { ball: true, k };
    }
    for (const [k, c] of C) if (contains(c.polys, lon, lat)) return { ball: true, k };
    return { ball: true, k: null };
  }

  function px(k) {
    return screenPx(C.get(k).area, dist(), 1, TAN, window.innerHeight);
  }

  function hoverAt(x, y) {
    const h = pickAt(x, y);
    setHover(h.k);
    hit.style.cursor = h.k ? (clickAction(px(h.k), S.z) === 'fly' ? 'zoom-in' : 'pointer') : drag ? 'grabbing' : 'grab';
  }
  function setHover(k) {
    if (hover === k) return;
    hover = k;
    setLift(k ? [k] : []);
  }

  function act(k) {
    const c = C.get(k);
    if (clickAction(px(k), S.z) === 'fly') {
      face(c.dir);
      S.zT = clamp(zoomFor(FLY_TO_PX, c.area, 1, TAN, window.innerHeight, NEAR, far()), 0, 1);
      invalidate();
      return;
    }
    close(k);
  }

  function focusContinent(c) {
    const spread = Math.min(1.2, Math.max(...c.list.map((x) => c.dir.angleTo(x.dir))) + 0.15);
    face(c.dir);
    S.zT = clamp(zoomAt(1 + Math.sin(spread) / (0.75 * TAN), 1, NEAR, far()), 0, 0.3);
    hover = null;
    setLift([]);
    invalidate();
  }

  function rowAct(k) {
    const c = C.get(k);
    const front = _n.copy(c.dir).applyQuaternion(spin.quaternion).z;
    if (front > 0.8 && clickAction(px(k), S.z) === 'shelf') return close(k);
    face(c.dir);
    S.zT = Math.max(S.zT, clamp(zoomFor(FLY_TO_PX, c.area, 1, TAN, window.innerHeight, NEAR, far()), 0, 1));
    setHover(k);
    invalidate();
  }

  const pointer = { x: 0, y: 0, in: false, moved: false };
  let drag = null;
  const touches = new Map();
  let pinch = null;
  hit.addEventListener('pointerdown', (e) => {
    if (S.mode !== 'on') return;
    hit.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: S.zT };
      if (drag) drag.moved = 99;
      return;
    }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: e.timeStamp, touch: e.pointerType !== 'mouse' };
    S.vel = 0;
  });
  hit.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.in = true;
      pointer.moved = true;
      invalidate();
    }
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()];
      S.zT = clamp(pinch.z0 + Math.log2(Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0) * 0.5, 0, 1);
      invalidate();
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.moved <= 6) return;
    const k = (2 * (dist() - 0.6) * TAN) / window.innerHeight;
    S.yawT += dx * k;
    S.tiltT = clamp(S.tiltT + dy * k, -tiltMax(S.zT), tiltMax(S.zT));
    const ms = Math.max(1, e.timeStamp - drag.t);
    S.vel = reduce.matches ? 0 : ((dx * k) / ms) * 16 * 0.5;
    drag.t = e.timeStamp;
    if (hover && !drag.touch) setHover(null);
    invalidate();
  });
  const up = (e) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (e.timeStamp - d.t > 80) S.vel = 0;
    if (d.moved > 6 || e.type !== 'pointerup') return;
    const h = pickAt(e.clientX, e.clientY);
    if (h.k) act(h.k);
    else setHover(null);
    invalidate();
  };
  hit.addEventListener('pointerup', up);
  hit.addEventListener('pointercancel', up);
  hit.addEventListener('pointerleave', () => {
    pointer.in = false;
    if (!drag) setHover(null);
  });
  hit.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (S.mode !== 'on') return;
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    S.zT = clamp(S.zT - e.deltaY * k * 0.0012, 0, 1);
    invalidate();
  }, { passive: false });

  labels.addEventListener('pointerover', (e) => {
    const b = e.target.closest('.b3d-lab');
    if (!b) return;
    const id = b.dataset.id;
    if (id[0] === '@') setLift(conts.find((c) => '@' + c.id === id).list.map((c) => c.country));
    else setHover(id);
  });
  labels.addEventListener('pointerout', (e) => {
    if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.b3d-lab')) {
      hover = null;
      setLift([]);
    }
  });
  labels.addEventListener('click', (e) => {
    const b = e.target.closest('.b3d-lab');
    if (!b) return;
    if (b.dataset.id[0] === '@') return focusContinent(conts.find((c) => '@' + c.id === b.dataset.id));
    act(b.dataset.id);
  });

  card.addEventListener('pointerover', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b) setHover(b.dataset.k);
  });
  card.addEventListener('pointerleave', () => setHover(null));
  card.addEventListener('focusin', (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    face(C.get(b.dataset.k).dir);
    setHover(b.dataset.k);
    invalidate();
  });
  card.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b) rowAct(b.dataset.k);
  });

  function keydown(e) {
    if (S.mode !== 'on') return false;
    if (e.key === 'Escape') {
      if (lifted.length) {
        hover = null;
        setLift([]);
      } else if (S.zT > 0.02) S.zT = 0;
      else close();
      invalidate();
      return true;
    }
    if (e.target.closest && e.target.closest('.b3d-map, input, textarea, select')) return false;
    const step = 0.25;
    if (e.key === 'ArrowLeft') S.yawT -= step;
    else if (e.key === 'ArrowRight') S.yawT += step;
    else if (e.key === 'ArrowUp') S.tiltT = clamp(S.tiltT - step, -tiltMax(S.zT), tiltMax(S.zT));
    else if (e.key === 'ArrowDown') S.tiltT = clamp(S.tiltT + step, -tiltMax(S.zT), tiltMax(S.zT));
    else if (e.key === '+' || e.key === '=') S.zT = clamp(S.zT + 0.15, 0, 1);
    else if (e.key === '-') S.zT = clamp(S.zT - 0.15, 0, 1);
    else if ([' ', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.key)) {}
    else return false;
    invalidate();
    return true;
  }

  text();
  document.addEventListener('langchange', text);

  return {
    open,
    close,
    frame,
    render,
    colors,
    keydown,
    card,
    get active() { return S.mode !== 'off'; },
    get on() { return S.mode === 'on'; },
  };
}
