import * as THREE from 'three';
import { FOV, RING, reach, decode, area, dirOf, toPixel, distAt, zoomAt, spread, focusDist, pinSpots, cull, ranking, nearestAngle, contains, SMALL, FOCUS } from 'books3d/geo.js';
import { readTokens } from 'scene3d/colors.js';
import { smallCover, titleOf, authorOf } from 'books3d/textures.js';
import { clamp, lerp, easeInOut } from 'scene3d/anim.js';
import { sunDir, lampDir } from 'scene3d/room.js';
import { standard } from 'scene3d/standard.js';
import { MATTER } from 'scene3d/glsl.js';

const TW = 4096;
const TH = 2048;
const NEAR = 1.55;
const TAN = Math.tan((FOV / 2) * Math.PI / 180);
const TURN = 1800;
const STEP = 0.15;
const DOT = 13;
const LIFT = 0.022;
const NIGHT_DARK = 0.565;
const CABINET = { W: 4.67, D: 2.33, H: 5, BACK: -1.2 };
const MIN_SPREAD = 0.08;
const PIN_N = 80;
const PIN_PX = 6;
const PIN_RISE = 260;
const PIN_STAGGER = 18;
const TOKENS = ['globe-sea', 'globe-land', 'globe-grid', 'oak', 'wall', 'brass', 'wood', 'edge', 'desk', 'paper', 'map-1', 'map-2', 'map-3', 'map-4', 'map-5'];
const RAW = ['globe-sea', 'globe-land', 'globe-line', 'globe-grid'];

const css = (c) => 'rgb(' + c.slice(0, 3).map((v) => Math.round(v * 255)).join(' ') + ')';
const dark = (c, k) => [c[0] * k, c[1] * k, c[2] * k, 1];

export async function createGlobe({ renderer, shelfCamera, books, geo, atlas, root, t, lang, reduce, onClosed, invalidate }) {
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
    C.set(r.country, { ...r, ids: books.map((b, i) => (b.g === r.country ? i : -1)).filter((i) => i >= 0).sort((x, y) => (books[y].r || 0) - (books[x].r || 0)), g, polys, area: a, small: a < SMALL, spread: Math.max(MIN_SPREAD, spread(polys, g.at)), dir: new THREE.Vector3(...dirOf(g.at[0], g.at[1])) });
  });
  const sub = new Map(geo.subregions.map((s) => [s.id, s]));
  const conts = geo.continents.map((c) => {
    const list = [...C.values()].filter((x) => (sub.get(x.g.subregion) || {}).continent === c.id);
    const dir = list.reduce((v, x) => v.addScaledVector(x.dir, x.count), new THREE.Vector3()).normalize();
    return { ...c, list, dir, count: list.reduce((s, x) => s + x.count, 0) };
  }).filter((c) => c.list.length).sort((a, b) => b.count - a.count);
  const contOf = new Map(conts.flatMap((c) => c.list.map((x) => [x.country, c.id])));
  let openC = conts[0].id;
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
  sun.position.set(...sunDir('globe').map((k) => k * 10));
  const key = new THREE.SpotLight(0xffd6a6, 0, 0, 0.6, 0.75, 0);
  key.position.set(...lampDir('globe').map((k) => k * 4));
  key.target.position.set(0, -0.3, 0);
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { near: 0.5, far: 12 });
  const glow = new THREE.PointLight(0xffc690, 0, 10, 1.2);
  glow.position.set(-2.2, 1.2, CABINET.BACK + 0.4);
  scene.add(hemi, sun, sun.target, key, key.target, glow);

  const canvas2d = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const mapC = canvas2d(TW, TH);
  const emitC = canvas2d(TW / 2, TH / 2);
  const dropC = canvas2d(TW / 2, TH / 2);
  const tex = (c) => {
    const x = new THREE.CanvasTexture(c);
    x.anisotropy = 8;
    return x;
  };
  const mapT = tex(mapC);
  const emitT = tex(emitC);
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

  const glowU = { value: 0 };
  const topGeo = new THREE.BufferGeometry();
  const topMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
  topMat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = glowU;
    sh.fragmentShader = 'uniform float uGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = vColor.rgb * uGlow;');
  };
  const top = new THREE.Mesh(topGeo, topMat);
  const rimGeo = new THREE.BufferGeometry();
  const rimMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  top.frustumCulled = rim.frustumCulled = false;
  const dropMat = new THREE.MeshBasicMaterial({ map: dropT, transparent: true, depthWrite: false, opacity: 0 });
  const drop = new THREE.Mesh(sphere, dropMat);
  drop.scale.setScalar(1.0008);
  const wallGeo = new THREE.BufferGeometry();
  const wallMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  top.visible = drop.visible = walls.visible = rim.visible = false;
  walls.frustumCulled = false;
  spin.add(drop, top, walls, rim);

  const brass = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const table = standard({ params: { roughness: 0.8 }, head: MATTER, color: 'diffuseColor.rgb *= wood(vec2(vWorld.x + vWorld.z * 0.7, vWorld.y + vWorld.z) * 150.0, 0.1);' });
  const wallM = new THREE.MeshStandardMaterial({ roughness: 1, emissive: 0xffffff, emissiveIntensity: 0 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(RING, 0.016, 10, 160, Math.PI * 1.25), brass);
  ring.rotation.z = -Math.PI / 2 - 0.35;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.3, 16), wood);
  post.position.y = -RING - 0.13;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.53, 0.12, 48), wood);
  base.position.y = -RING - 0.32;
  base.castShadow = true;
  const desk = new THREE.Mesh(new THREE.BoxGeometry(CABINET.W, CABINET.H, CABINET.D), table);
  desk.position.set(0, -RING - 0.38 - CABINET.H / 2, CABINET.BACK + CABINET.D / 2);
  desk.receiveShadow = true;
  desk.castShadow = true;
  const wallG = new THREE.PlaneGeometry(1, 400);
  wallG.translate(0.5, 0, 0);
  const wall = new THREE.Mesh(wallG, wallM);
  wall.position.x = -30;
  wall.scale.x = 60;
  wall.position.z = CABINET.BACK - 0.01;
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
  const shapeOf = (c) => (c.small ? [[circle(c.g.at, (DOT * 1.3 * 360) / TW)]] : c.polys);
  const SPLIT = 2;

  function buildTop() {
    const pos = [];
    const col = [];
    const add = (pts, rgb) => pts.forEach(([lon, lat]) => {
      pos.push(...dirOf(lon, lat));
      col.push(...rgb);
    });
    const split = (a, b, c, rgb) => {
      const ab = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const bc = Math.hypot(b[0] - c[0], b[1] - c[1]);
      const ca = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (Math.max(ab, bc, ca) <= SPLIT) return add([a, b, c], rgb);
      const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const x = m(a, b);
      const y = m(b, c);
      const z = m(c, a);
      split(a, x, z, rgb);
      split(x, b, y, rgb);
      split(z, y, c, rgb);
      split(x, y, z, rgb);
    };
    const strip = (r) => {
      const pts = r.map(([x, y]) => new THREE.Vector2(x, y));
      if (pts.length > 1 && pts[0].equals(pts[pts.length - 1])) pts.pop();
      return pts;
    };
    lifted.forEach((k) => {
      const c = C.get(k);
      const rgb = tok['map-' + (c.cls + 1)].slice(0, 3);
      shapeOf(c).forEach((rings) => {
        const contour = strip(rings[0]);
        const holes = rings.slice(1).map(strip);
        const faces = THREE.ShapeUtils.triangulateShape(contour, holes);
        const all = contour.concat(...holes).map((v) => [v.x, v.y]);
        faces.forEach(([a, b, d]) => split(all[a], all[b], all[d], rgb));
      });
    });
    topGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    topGeo.setAttribute('normal', new THREE.Float32BufferAttribute(pos, 3));
    topGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }

  let rimW = 0;
  function buildRim(w) {
    rimW = w;
    const pos = [];
    const _a = new THREE.Vector3();
    const _b = new THREE.Vector3();
    const _s = new THREE.Vector3();
    lifted.forEach((k) => {
      shapeOf(C.get(k)).flat().forEach((r) => {
        for (let i = 0; i < r.length - 1; i++) {
          _a.set(...dirOf(r[i][0], r[i][1]));
          _b.set(...dirOf(r[i + 1][0], r[i + 1][1]));
          _s.subVectors(_b, _a).cross(_a).normalize().multiplyScalar(w / 2);
          const p = [_a.clone().add(_s), _a.clone().sub(_s), _b.clone().sub(_s), _b.clone().add(_s)];
          [0, 1, 2, 0, 2, 3].forEach((j) => pos.push(p[j].x, p[j].y, p[j].z));
        }
      });
    });
    rimGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }
  const rimWant = () => (2.5 * (dist() - 1) * 2 * TAN) / window.innerHeight;

  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshStandardMaterial({ roughness: 0.28 }), PIN_N);
  const needles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.05, 1, 8).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.7 }), PIN_N);
  heads.frustumCulled = needles.frustumCulled = false;
  heads.count = needles.count = 0;
  spin.add(needles, heads);
  const pins = { k: null, list: [], t0: 0, out: false, r: 0, hot: -1 };
  const _pu = new THREE.Vector3(0, 1, 0);
  const _pp = new THREE.Vector3();
  const _pq = new THREE.Quaternion();
  const _ps = new THREE.Vector3();
  const _pm = new THREE.Matrix4();
  const _pc = new THREE.Color();
  const overshoot = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

  function setPins(k) {
    const c = C.get(k);
    const spots = pinSpots(shapeOf(c), Math.min(PIN_N, c.ids.length));
    pins.list = spots.map(([lon, lat], j) => {
      const d = new THREE.Vector3(...dirOf(lon, lat));
      const away = d.clone().sub(c.dir).projectOnPlane(d);
      const up = away.lengthSq() > 1e-12 ? d.clone().addScaledVector(away.normalize(), 0.2).normalize() : d.clone();
      return { i: c.ids[j], d, up };
    });
    pins.k = k;
    pins.t0 = performance.now();
    pins.out = false;
    pins.hot = -1;
    pins.r = (PIN_PX * (pinDist(c) - 1) * 2 * TAN) / window.innerHeight;
    paintPins();
    fillStrip();
  }

  function dropPins() {
    if (!pins.list.length || pins.out) return;
    pins.out = true;
    pins.t0 = performance.now();
    pins.hot = -1;
    strip.el.hidden = true;
    strip.on = false;
  }

  function paintPins() {
    pins.list.forEach((p, j) => heads.setColorAt(j, _pc.setRGB(...(j === pins.hot ? tok.edge : tok.paper).slice(0, 3))));
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
  }

  function stepPins(now) {
    if (!pins.list.length) return false;
    let busy = false;
    const L = pins.r * 2.6;
    heads.count = needles.count = pins.list.length;
    pins.list.forEach((p, j) => {
      const t = reduce.matches ? 1 : clamp((now - pins.t0 - (pins.out ? 0 : j * PIN_STAGGER)) / PIN_RISE, 0, 1);
      if (t < 1) busy = true;
      const e = pins.out ? 1 - easeInOut(t) : overshoot(t);
      const hot = j === pins.hot;
      _pq.setFromUnitVectors(_pu, p.up);
      _pp.copy(p.d).multiplyScalar(1 + S.h);
      needles.setMatrixAt(j, _pm.compose(_pp, _pq, _ps.set(pins.r, L * e * (hot ? 1.15 : 1), pins.r)));
      _pp.addScaledVector(p.up, L * e * (hot ? 1.15 : 1));
      heads.setMatrixAt(j, _pm.compose(_pp, _pq, _ps.setScalar(pins.r * Math.max(0, e) * (hot ? 1.2 : 1))));
    });
    heads.instanceMatrix.needsUpdate = needles.instanceMatrix.needsUpdate = true;
    if (pins.out && !busy) {
      pins.list = [];
      pins.k = null;
      heads.count = needles.count = 0;
    }
    return busy;
  }

  const _ph = new THREE.Vector3();
  const _pv = new THREE.Vector3();
  function pickPin(x, y, touch) {
    if (!pins.list.length || pins.out) return -1;
    ndc.set((x / window.innerWidth) * 2 - 1, 1 - (y / window.innerHeight) * 2);
    ray.setFromCamera(ndc, camera);
    let best = -1;
    let bd = ((pins.r * (touch ? 22 : 12)) / PIN_PX) ** 2;
    pins.list.forEach((p, j) => {
      _ph.copy(p.d).multiplyScalar(1 + S.h).addScaledVector(p.up, pins.r * 2.6).applyQuaternion(spin.quaternion);
      const d = ray.ray.distanceSqToPoint(_ph);
      if (d < bd) { bd = d; best = j; }
    });
    return best;
  }

  function hotPin(j) {
    if (pins.hot === j) return;
    pins.hot = j;
    paintPins();
    invalidate();
    markStrip();
  }


  function paintLift() {
    const d = dropC.getContext('2d');
    d.clearRect(0, 0, TW / 2, TH / 2);
    d.filter = 'blur(4px)';
    d.fillStyle = night ? 'rgba(0,0,0,.7)' : 'rgba(60,35,20,.45)';
    lifted.forEach((k) => {
      const c = C.get(k);
      d.save();
      d.translate(2.5, 3.5);
      trace(d, c.polys, 0.5);
      if (c.small) dot(d, c, 0.5, DOT * 1.3);
      d.fill('evenodd');
      d.restore();
    });
    d.filter = 'none';
    dropT.needsUpdate = true;
    buildTop();
    buildRim(rimWant());
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
      const rings = shapeOf(c).flat();
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
  }

  let stale = true;
  function fresh() {
    if (!stale) return;
    stale = false;
    paint();
    paintLift();
  }

  function warm() {
    fresh();
    [mapT, emitT, dropT].forEach((x) => renderer.initTexture(x));
    camera.position.set(0, 0, far());
    camera.quaternion.identity();
    camera.aspect = aspect();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    return renderer.compileAsync(scene, camera).then(() => {
      const rt = new THREE.WebGLRenderTarget(64, 64);
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      rt.dispose();
    });
  }

  renderer.domElement.addEventListener('webglcontextrestored', () => {
    [mapT, emitT, dropT].forEach((x) => { x.needsUpdate = true; });
    invalidate();
  });

  function colors(isNight) {
    night = isNight;
    tok = readTokens(TOKENS);
    const cs = getComputedStyle(document.documentElement);
    RAW.forEach((k) => { raw[k] = cs.getPropertyValue('--' + k).trim() || '#808080'; });
    brass.color.setRGB(...tok.brass.slice(0, 3));
    brass.roughness = night ? 0.4 : 0.35;
    brass.metalness = night ? 0.55 : 0.6;
    wood.color.setRGB(...tok.wood.slice(0, 3));
    wood.roughness = night ? 0.4 : 0.6;
    table.color.setRGB(...tok.oak.slice(0, 3));
    wallM.color.setRGB(...tok.wall.slice(0, 3));
    wallM.emissive.setRGB(...tok.wall.slice(0, 3));
    wallM.emissiveIntensity = night ? 0.22 : 0.05;
    wallMat.color.setRGB(...dark(tok.edge, 0.85).slice(0, 3));
    ballMat.emissiveIntensity = night ? 0.8 : 0;
    glowU.value = night ? 0.8 : 0;
    topMat.color.setScalar(night ? NIGHT_DARK : 1);
    rimMat.color.setRGB(...tok.edge.slice(0, 3));
    needles.material.color.setRGB(...tok.brass.slice(0, 3));
    paintPins();
    hemi.intensity = night ? 1.3 : 2.6;
    sun.intensity = night ? 0.1 : 1.4;
    sun.castShadow = !night;
    key.intensity = night ? 3 : 0;
    key.castShadow = night;
    glow.intensity = night ? 7 : 0;
    stale = true;
    if (S.mode !== 'off') fresh();
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
  const strip = { el: document.createElement('aside'), row: null, on: false, raf: 0, lock: 0 };
  strip.el.className = 'b3d-strip';
  strip.el.hidden = true;
  strip.el.innerHTML = '<div class="b3d-strip-head"><b></b><span></span></div><div class="b3d-strip-row"></div><p class="b3d-strip-now"><b></b><small></small></p>';
  strip.row = strip.el.querySelector('.b3d-strip-row');
  root.append(hit, labels, tip, card, strip.el);

  function fillStrip() {
    strip.on = true;
    strip.el.hidden = false;
    stripText();
    strip.row.innerHTML = pins.list.map((p, j) => {
      const b = books[p.i];
      const url = smallCover(b.cv);
      return '<button type="button" data-j="' + j + '" aria-label="' + esc(titleOf(b) + ', ' + authorOf(b)) + '">'
        + (url ? '<img src="' + esc(url) + '" alt="" loading="lazy">' : '<i style="background:' + esc(b.c || '#888') + '"></i>') + '</button>';
    }).join('');
    stripTo(0, false);
    pins.hot = -1;
    hotPin(0);
  }
  function stripText() {
    if (!strip.on || pins.k == null) return;
    const h = strip.el.querySelector('.b3d-strip-head');
    h.children[0].textContent = nameOf(pins.k);
    h.children[1].textContent = t('books.count', pins.list.length);
    markStrip();
  }
  function markStrip() {
    strip.row.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === pins.hot));
    const now = strip.el.querySelector('.b3d-strip-now');
    const b = pins.hot >= 0 && books[pins.list[pins.hot].i];
    now.children[0].textContent = b ? titleOf(b) : '';
    now.children[1].textContent = b ? authorOf(b) : '';
  }
  function stripTo(j, smooth) {
    const b = strip.row.children[j];
    if (!b) return;
    strip.lock = performance.now() + (smooth ? 500 : 0);
    strip.row.scrollTo({ left: b.offsetLeft + b.offsetWidth / 2 - strip.row.clientWidth / 2, behavior: smooth && !reduce.matches ? 'smooth' : 'auto' });
  }

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
    C.forEach((c, k) => { labelEls.get(k).el.textContent = nameOf(k); });
    conts.forEach((c) => { labelEls.get('@' + c.id).el.textContent = c[lang()] || c.en; });
    labelEls.forEach((l) => { l.w = 0; });
    stripText();
    card.setAttribute('aria-label', t('books3d.map_title'));
    const name = (c) => c[lang()] || c.en;
    const max = ranks[0].count;
    card.innerHTML = '<div class="b3d-map-head"><h2>' + esc(t('books3d.map_title')) + '</h2><span>' + esc(t('books3d.map_countries', C.size) + ' · ' + t('books.count', total)) + '</span></div>'
      + '<div class="b3d-share">' + conts.map((c) => '<button type="button" tabindex="-1" aria-hidden="true" data-c="' + c.id + '" style="flex:' + c.count + '"' + (c.id === openC ? ' class="on"' : '') + '></button>').join('') + '</div>'
      + conts.map((c) => '<section class="b3d-cont"><button type="button" class="b3d-cont-h" data-c="' + c.id + '" aria-expanded="' + (c.id === openC) + '"><span class="nm">' + esc(name(c)) + '</span><span class="ct">' + esc(t('books.count', c.count) + ' · ' + t('books3d.map_countries', c.list.length)) + '</span><svg viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5l4 4 4-4"/></svg></button>'
        + (c.id === openC ? '<div class="b3d-rank-wrap"><ol class="b3d-rank">' + c.list.map((x) => '<li><button type="button" data-k="' + esc(x.country) + '" aria-label="' + esc(nameOf(x.country) + ', ' + t('books.count', x.count)) + '"><span class="nm">' + esc(nameOf(x.country)) + '</span><i style="--c:var(--map-' + (x.cls + 1) + ');--w:' + (x.count / max * 100).toFixed(1) + '%"></i><span class="ct">' + x.count + '</span></button></li>').join('') + '</ol><i class="b3d-thumb" aria-hidden="true"></i></div>' : '')
        + '</section>').join('');
    rank = card.querySelector('.b3d-rank');
    if (rank) rank.addEventListener('scroll', scrollThumb, { passive: true });
    requestAnimationFrame(scrollThumb);
    markRows();
  }
  function openCont(id) {
    openC = openC === id ? null : id;
    const f = document.activeElement && document.activeElement.closest('.b3d-map') && document.activeElement.dataset.c;
    text();
    if (f) card.querySelector('.b3d-cont-h[data-c="' + f + '"]').focus();
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
  let focused = null;
  const far = () => reach(aspect());
  const aspect = () => window.innerWidth / Math.max(1, window.innerHeight);
  const dist = () => distAt(S.z, 1, NEAR, far());
  const pinDist = (c) => focusDist(c.spread, TAN, aspect(), aspect() < 1 ? 0.85 : FOCUS);

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

  function open(G, R, front) {
    S.G.copy(G);
    S.R = R;
    wall.position.x = front;
    wall.scale.x = 30 - front;
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
    fresh();
    invalidate();
  }

  function close(then) {
    if (S.mode === 'off' || S.mode === 'out') return;
    dropPins();
    focused = hover = null;
    setLift([]);
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
    const back = easeInOut(clamp(e / 0.35, 0, 1));
    const turn = easeInOut(clamp((e - 0.1) / 0.6, 0, 1));
    const rise = easeInOut(clamp((e - 0.4) / 0.15, 0, 1));
    const walk = easeInOut(clamp((e - 0.45) / 0.55, 0, 1));
    _p.copy(sc.position);
    _p.z += sc.position.z * STEP * back;
    _p.sub(S.G).divideScalar(S.R).applyQuaternion(qR);
    const y = lerp(_p.y, target.position.y, rise);
    camera.position.lerpVectors(_p, target.position, walk);
    camera.position.y = y;
    _q.copy(qR);
    camera.quaternion.slerpQuaternions(_q, target.quaternion, turn);
    e = walk;
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
    top.visible = drop.visible = walls.visible = rim.visible = !!shown;
    if (shown) {
      top.scale.setScalar(1 + S.h);
      rim.scale.setScalar((1 + S.h) * 1.0004);
      const w = rimWant();
      if (Math.abs(w - rimW) > rimW * 0.15) buildRim(w);
      setWalls(1 + S.h);
      dropMat.opacity = clamp(S.h / LIFT, 0, 1);
    }
    spin.rotation.set(S.tilt, S.yaw, 0, 'XYZ');
    const e = S.p;
    sceneCam(e);
    if (S.mode === 'on' && pointer.in && pointer.moved && !drag) {
      pointer.moved = false;
      hoverAt(pointer.x, pointer.y);
    }
    if (stepPins(performance.now())) busy = true;
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
    if (on && pins.list.length && !pins.out) {
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      pins.list.forEach((p, j) => {
        const q = project(_pv.copy(p.d).multiplyScalar(1 + S.h).addScaledVector(p.up, pins.r * 2.6));
        if (q.facing <= 0) return;
        list.push({ id: '#' + j, x: q.x, y: q.y - PIN_PX, w: PIN_PX * 3, h: PIN_PX * 5, score: Infinity, vw, vh });
        box[0] = Math.min(box[0], q.x);
        box[1] = Math.min(box[1], q.y - PIN_PX * 3.5);
        box[2] = Math.max(box[2], q.x);
      });
      const f = list.find((x) => x.id === pins.k);
      if (f && box[0] < Infinity) {
        f.x = (box[0] + box[2]) / 2;
        f.y = box[1] - f.h / 2 - 4;
        f.score = Infinity;
        labelEls.get(pins.k).p = { ...labelEls.get(pins.k).p, x: f.x, y: f.y };
      }
    }
    const keep = new Set(cull(list).map((x) => x.id));
    labelEls.forEach((l, id) => {
      const show = keep.has(id);
      l.el.classList.toggle('off', !show);
      if (show) l.el.style.transform = 'translate(' + (l.p.x - l.w / 2).toFixed(1) + 'px,' + (l.p.y - l.h / 2).toFixed(1) + 'px)';
      l.el.classList.toggle('lit', !!(lifted.length && (id[0] === '@' ? false : lifted.includes(id))));
    });
    if (hover && !keep.has(hover)) {
      const p = labelEls.get(hover).p;
      tip.innerHTML = '<b>' + esc(nameOf(hover)) + '</b>';
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

  function hoverAt(x, y) {
    const j = pickPin(x, y);
    if (j >= 0) {
      if (j !== pins.hot) {
        hotPin(j);
        stripTo(j, true);
      }
      hit.style.cursor = 'pointer';
      return;
    }
    const h = pickAt(x, y);
    setHover(h.k);
    hit.style.cursor = h.k ? 'pointer' : drag ? 'grabbing' : 'grab';
  }
  function setHover(k) {
    if (hover === k) return;
    hover = k;
    setLift([...new Set([focused, k])].filter(Boolean));
  }

  function unfocus() {
    dropPins();
    focused = hover = null;
    setLift([]);
  }

  function act(k) {
    if (focused === k) return close(k);
    const c = C.get(k);
    face(c.dir);
    S.zT = clamp(zoomAt(pinDist(c), 1, NEAR, far()), 0, 1);
    focused = k;
    if (openC !== contOf.get(k)) openCont(contOf.get(k));
    setPins(k);
    setLift([...new Set([k, hover])].filter(Boolean));
    invalidate();
  }

  function focusContinent(c) {
    const spread = Math.min(1.2, Math.max(...c.list.map((x) => c.dir.angleTo(x.dir))) + 0.15);
    face(c.dir);
    S.zT = clamp(zoomAt(1 + Math.sin(spread) / (0.75 * TAN), 1, NEAR, far()), 0, 0.3);
    unfocus();
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
    const j = pickPin(e.clientX, e.clientY, d.touch);
    if (j >= 0 && strip.on && pins.hot !== j) {
      hotPin(j);
      stripTo(j, true);
      return;
    }
    if (j >= 0) {
      close({ country: pins.k, book: pins.list[j].i });
      invalidate();
      return;
    }
    const h = pickAt(e.clientX, e.clientY);
    if (h.k) act(h.k);
    else unfocus();
    invalidate();
  };
  strip.row.addEventListener('scroll', () => {
    if (strip.raf) return;
    strip.raf = requestAnimationFrame(() => {
      strip.raf = 0;
      if (!strip.on || strip.lock > performance.now()) return;
      const mid = strip.row.scrollLeft + strip.row.clientWidth / 2;
      let best = -1;
      let bd = Infinity;
      strip.row.querySelectorAll('button').forEach((b, j) => {
        const d = Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid);
        if (d < bd) { bd = d; best = j; }
      });
      hotPin(best);
    });
  }, { passive: true });
  strip.row.addEventListener('pointerover', (e) => {
    const b = e.target.closest('button[data-j]');
    if (b && e.pointerType === 'mouse') hotPin(+b.dataset.j);
  });
  strip.row.addEventListener('focusin', (e) => {
    const b = e.target.closest('button[data-j]');
    if (!b) return;
    hotPin(+b.dataset.j);
    stripTo(+b.dataset.j, true);
  });
  strip.row.addEventListener('keydown', (e) => {
    const b = e.target.closest('button[data-j]');
    const to = b && (e.key === 'ArrowRight' ? b.nextElementSibling : e.key === 'ArrowLeft' ? b.previousElementSibling : null);
    if (!to) return;
    e.preventDefault();
    to.focus({ preventScroll: true });
  });
  let wheelAcc = 0;
  strip.row.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    wheelAcc += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    if (Math.abs(wheelAcc) < 40) return;
    const j = clamp(pins.hot + Math.sign(wheelAcc), 0, pins.list.length - 1);
    wheelAcc = 0;
    hotPin(j);
    stripTo(j, true);
  }, { passive: false });
  strip.row.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-j]');
    if (!b || !pins.list.length) return;
    close({ country: pins.k, book: pins.list[+b.dataset.j].i });
    invalidate();
  });
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
      setLift(focused ? [focused] : []);
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
    if (b) return act(b.dataset.k);
    const h = e.target.closest('button[data-c]');
    if (!h) return;
    const c = conts.find((x) => x.id === h.dataset.c);
    if (openC !== c.id) focusContinent(c);
    openCont(c.id);
  });

  function keydown(e) {
    if (S.mode !== 'on') return false;
    if (e.key === 'Escape') {
      if (lifted.length) unfocus();
      else if (S.zT > 0.02) S.zT = 0;
      else close();
      invalidate();
      return true;
    }
    if (e.target.closest && e.target.closest('.b3d-map, .b3d-strip, input, textarea, select')) return false;
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
    warm,
    get active() { return S.mode !== 'off'; },
    get on() { return S.mode === 'on'; },
  };
}
