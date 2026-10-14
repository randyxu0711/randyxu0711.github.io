import * as THREE from 'three';
import { LIGHT, REVEAL, SKETCH } from 'scene3d/glsl.js';
import { box } from 'scene3d/geometry.js';
import { CARD, IMG, DRAWER, CAB, FOV, SPLIT } from 'shares3d/layout.js';

const TAB = { W: 30, H: 8, GAP: 2.5, MAX: 3, EDGE: 6 };
const STICKY = 18;
const HANDLE = { W: 32, H: 6, D: 6, DROP: 29 };
const SHADOW = 9;
const TRAY = { T: 3, SIDE: 34 };

const FINISH = 'gl_FragColor = vec4(mix(mix(sketch(lit(c, vN), vN, vUv), uDesk, max(uDim, vFade)), uUnlit.rgb, uUnlit.a), 1.0);';

const INST_VERT = /* glsl */ `
attribute float face;
attribute vec4 iTile;
attribute vec3 iColor;
attribute float iFade;
attribute float iHot;
varying vec4 vTile;
varying vec3 vColor;
varying vec3 vN;
varying vec2 vUv;
varying float vFace;
varying float vFade;
varying float vHot;
varying vec3 vWorld;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vFade = iFade;
  vHot = iHot;
  vec4 w = m * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = mat3(m) * normal;
  vUv = uv;
  vFace = face;
  vTile = iTile;
  vColor = iColor;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const INST_HEAD = /* glsl */ `
uniform vec3 uDesk;
uniform float uDim;
uniform vec4 uUnlit;
varying vec4 vTile;
varying vec3 vColor;
varying vec3 vN;
varying vec2 vUv;
varying float vFace;
varying float vFade;
varying float vHot;
${LIGHT}
${SKETCH}
`;

const CARD_VERT = INST_VERT.replace('attribute float iHot;', 'attribute float iHot;\nattribute float iPhoto;\nattribute float iHero;\nattribute vec4 iPhotoTile;\nvarying float vPhoto;\nvarying float vHero;\nvarying vec4 vPhotoTile;').replace('vHot = iHot;', 'vHot = iHot;\n  vPhoto = iPhoto;\n  vHero = iHero;\n  vPhotoTile = iPhotoTile;');

const CARD_FRAG = /* glsl */ `
uniform sampler2D uCards;
uniform sampler2D uPhotos;
uniform sampler2D uHeroMask;
uniform sampler2D uHeroPhoto;
uniform vec3 uFace;
uniform vec3 uPaper;
uniform vec3 uPaperDeep;
uniform vec3 uInk3;
uniform vec3 uEdge;
varying float vPhoto;
varying float vHero;
varying vec4 vPhotoTile;
${INST_HEAD}
void main() {
  int f = int(vFace + 0.5);
  float ty = (1.0 - vUv.y) * ${CARD.H.toFixed(2)};
  vec2 at = vTile.xy + vUv * vTile.zw;
  float hm = step(0.5, vHero);
  float hp = step(1.5, vHero);
  vec3 m = mix(texture2D(uCards, at).rgb * step(0.0001, vTile.z), texture2D(uHeroMask, vUv).rgb, hm);
  vec3 c = mix(uPaperDeep, uEdge, vHot);
  if (f == 4) {
    if (ty < ${IMG.H.toFixed(2)}) {
      float r = ${(IMG.H / CARD.H).toFixed(5)};
      vec2 pu = vec2(vUv.x, clamp((vUv.y - (1.0 - r)) / r, 0.0, 1.0));
      vec3 photo = mix(texture2D(uPhotos, vPhotoTile.xy + pu * vPhotoTile.zw).rgb, texture2D(uHeroPhoto, pu).rgb, hp);
      c = mix(mix(uPaper, uInk3, m.g * 0.7), photo, vPhoto * max(step(0.0001, vPhotoTile.z), hp));
    } else {
      c = mix(uFace, uInk, m.r);
      c = mix(c, uInk3, m.g);
      c = mix(c, vColor, m.b * 0.9);
    }
  } else if (f == 5) {
    c = uPaper;
  }
  ${FINISH}
}
`;

const SOLID_FRAG = /* glsl */ `
${INST_HEAD}
void main() {
  vec3 c = vColor;
  ${FINISH}
}
`;

const TAB_FRAG = /* glsl */ `
uniform sampler2D uLabels;
${INST_HEAD}
void main() {
  vec3 c = vColor;
  if (int(vFace + 0.5) == 4) c = mix(c, uInk, texture2D(uLabels, vTile.xy + vUv * vTile.zw).r * step(0.0001, vTile.z) * 0.85);
  ${FINISH}
}
`;

const DRAWER_FRAG = /* glsl */ `
uniform sampler2D uLabels;
uniform vec3 uFace;
uniform vec3 uInk3;
uniform vec3 uEdgeNDeep;
uniform vec3 uEdge;
${INST_HEAD}
void main() {
  int f = int(vFace + 0.5);
  vec3 c = mix(uEdgeNDeep, uEdge, vHot);
  if (f == 4) {
    vec3 m = texture2D(uLabels, vTile.xy + vUv * vTile.zw).rgb * step(0.0001, vTile.z);
    float tinted = step(0.001, vColor.r + vColor.g + vColor.b);
    float strip = step(0.94, vUv.y) * step(0.06, vUv.x) * step(vUv.x, 0.94);
    float band = step(0.1797, vUv.x) * step(vUv.x, 0.2148) * step(0.4531, vUv.y) * step(vUv.y, 0.8594);
    c = mix(uFace, vColor, max(strip, band) * tinted);
    c = mix(c, mix(uInk3, uEdge, vHot), 0.8 * smoothstep(0.25, 0.45, m.b) * (1.0 - smoothstep(0.7, 0.9, m.b)));
    c = mix(c, uInk, m.r);
    c = mix(c, mix(uInk3, uEdge, vHot), m.g);
  }
  ${FINISH}
}
`;

const DESK_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const DESK_FRAG = /* glsl */ `
uniform vec3 uDesk;
uniform vec4 uUnlit;
${LIGHT}
void main() {
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 day = vec3(uAmbient + uKey * max(dot(n, uLight), 0.0));
  vec3 c = lit(uDesk, n) / day;
  gl_FragColor = vec4(mix(c, uUnlit.rgb, uUnlit.a), 1.0);
}
`;

const FLAT_VERT = /* glsl */ `
attribute vec4 iTile;
attribute vec2 iInner;
attribute float iFade;
varying vec4 vTile;
varying vec2 vInner;
varying vec2 vUv;
varying float vFade;
varying vec3 vWorld;
void main() {
  vFade = iFade;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vUv = uv;
  vTile = iTile;
  vInner = iInner;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SHADOW_FRAG = /* glsl */ `
uniform vec4 uDrop;
uniform float uDim;
uniform vec4 uUnlit;
varying vec2 vInner;
varying vec2 vUv;
varying float vFade;
${REVEAL}
void main() {
  vec2 q = max(abs(vUv * 2.0 - 1.0) - vInner, 0.0) / max(1.0 - vInner, vec2(0.001));
  float a = 1.0 - smoothstep(0.0, 1.0, length(q));
  gl_FragColor = vec4(mix(uDrop.rgb, uUnlit.rgb, uUnlit.a), uDrop.a * a * a * (1.0 - max(uDim, vFade)) * (1.0 - sketchAmount()));
}
`;

const _qe = new THREE.Quaternion();
const _ee = new THREE.Euler();
export function quat(rx, ry) {
  _qe.setFromEuler(_ee.set(rx, ry, 0, 'YXZ'));
  return [_qe.x, _qe.y, _qe.z, _qe.w];
}

export function blend(a, b, t) {
  _qe.set(a.q[0], a.q[1], a.q[2], a.q[3]).slerp(_qb.set(b.q[0], b.q[1], b.q[2], b.q[3]), t);
  const sa = a.s === undefined ? 1 : a.s;
  const sb = b.s === undefined ? 1 : b.s;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, q: [_qe.x, _qe.y, _qe.z, _qe.w], s: sa + (sb - sa) * t };
}
const _qb = new THREE.Quaternion();

export function createScene(n) {
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 8000);

  const common = {
    uLight: { value: new THREE.Vector3(-0.25, 0.85, 0.45).normalize() },
    uAmbient: { value: 0.62 },
    uKey: { value: 0.42 },
    uLamp: { value: new THREE.Vector4(0, 0, 0, 0) },
    uLampColor: { value: new THREE.Color(1, 0.85, 0.6) },
    uLampReach: { value: 380 },
  };
  const colors = {
    uDesk: { value: new THREE.Color() },
    uEdgeNDeep: { value: new THREE.Color() },
    uFace: { value: new THREE.Color() },
    uPaper: { value: new THREE.Color() },
    uPaperDeep: { value: new THREE.Color() },
    uInk: { value: new THREE.Color() },
    uInk3: { value: new THREE.Color() },
    uEdge: { value: new THREE.Color() },
    uDrop: { value: new THREE.Vector4() },
    uDim: { value: 0 },
    uUnlit: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSketch: { value: new THREE.Vector4(0, 0, 1, 9) },
    uCards: { value: null },
    uPhotos: { value: null },
    uHeroMask: { value: null },
    uHeroPhoto: { value: null },
    uLabels: { value: null },
  };
  const uniforms = Object.assign({}, common, colors);
  const material = (vertexShader, fragmentShader, extra = {}) => new THREE.ShaderMaterial(Object.assign({ uniforms, vertexShader, fragmentShader }, extra));

  function instanced(geo, mat, max, attrs) {
    Object.entries(attrs).forEach(([name, size]) => geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(max * size), size)));
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    return mesh;
  }
  const solidAttrs = { iTile: 4, iColor: 3, iFade: 1, iHot: 1 };
  const flatAttrs = { iTile: 4, iInner: 2, iFade: 1 };
  const flatGeo = (w, h) => new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2);

  const desk = new THREE.Mesh(flatGeo(8000, 8000), material(DESK_VERT, DESK_FRAG));
  desk.position.z = -1000;
  scene.add(desk);

  const maxDrawers = n + 32;
  const maxCards = n + SPLIT;
  const shadows = instanced(flatGeo(1, 1), material(FLAT_VERT, SHADOW_FRAG, { transparent: true, depthWrite: false }), 40, flatAttrs);
  const cards = instanced(box(-CARD.W / 2, CARD.W / 2, -CARD.H / 2, CARD.H / 2, -CARD.T / 2, CARD.T / 2), material(CARD_VERT, CARD_FRAG), maxCards, Object.assign({ iPhoto: 1, iHero: 1, iPhotoTile: 4 }, solidAttrs));
  const solidMat = material(INST_VERT, SOLID_FRAG);
  const tabs = instanced(box(-TAB.W / 2, TAB.W / 2, 0, TAB.H, -CARD.T / 2, CARD.T / 2), material(INST_VERT, TAB_FRAG), maxCards * TAB.MAX, solidAttrs);
  const stickies = instanced(box(-STICKY / 2, STICKY / 2, -STICKY / 2, STICKY / 2, 0, 0.3), solidMat, maxCards, solidAttrs);
  const tray = instanced(box(-0.5, 0.5, 0, 1, -0.5, 0.5), solidMat, 4, solidAttrs);
  const body = instanced(box(-0.5, 0.5, 0, 1, -0.5, 0.5), solidMat, 1, solidAttrs);
  const fronts = instanced(box(-DRAWER.W / 2, DRAWER.W / 2, -DRAWER.H / 2, DRAWER.H / 2, 0, DRAWER.D), material(INST_VERT, DRAWER_FRAG), maxDrawers, solidAttrs);
  const handles = instanced(box(-HANDLE.W / 2, HANDLE.W / 2, -HANDLE.H / 2, HANDLE.H / 2, 0, HANDLE.D), solidMat, maxDrawers, solidAttrs);

  const _m = new THREE.Matrix4();
  const _a = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const tint = { sticky: [1, 1, 0.6], body: [0.5, 0.5, 0.5], handle: [0.4, 0.4, 0.4], edge: [0.8, 0.6, 0.3] };

  function pose(m, x, y, z, rx, ry, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, 0, 'YXZ');
    _q.setFromEuler(_e);
    return m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  }
  function touch(mesh, ...names) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.boundingSphere = null;
    names.forEach((k) => { mesh.geometry.attributes[k].needsUpdate = true; });
  }
  function paint(mesh, count, rgb) {
    const a = mesh.geometry.attributes.iColor;
    for (let k = 0; k < count; k++) a.setXYZ(k, rgb[0], rgb[1], rgb[2]);
    a.needsUpdate = true;
  }

  function place(m, c) {
    _q.set(c.q[0], c.q[1], c.q[2], c.q[3]);
    const k = c.s === undefined ? 1 : c.s;
    return m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(k, k, k));
  }

  function setCards(list) {
    const tile = cards.geometry.attributes.iTile;
    const stamp = cards.geometry.attributes.iColor;
    const tabColor = tabs.geometry.attributes.iColor;
    const tabTile = tabs.geometry.attributes.iTile;
    const fades = [cards, tabs, stickies].map((mesh) => mesh.geometry.attributes.iFade);
    const hot = cards.geometry.attributes.iHot;
    const photo = cards.geometry.attributes.iPhoto;
    const photoTile = cards.geometry.attributes.iPhotoTile;
    const hero = cards.geometry.attributes.iHero;
    let ns = 0;
    let nt = 0;
    cards.count = Math.min(list.length, maxCards);
    for (let k = 0; k < cards.count; k++) {
      const c = list[k];
      place(_m, c);
      if (c.hidden) _m.makeScale(0, 0, 0);
      cards.setMatrixAt(k, _m);
      const t = c.tile || [0, 0, 0, 0];
      tile.setXYZW(k, t[0], t[1], t[2], t[3]);
      stamp.setXYZ(k, c.stamp[0], c.stamp[1], c.stamp[2]);
      fades[0].setX(k, c.fade || 0);
      hot.setX(k, c.hot || 0);
      photo.setX(k, c.photo || 0);
      hero.setX(k, c.hero || 0);
      const pt = c.photoTile || [0, 0, 0, 0];
      photoTile.setXYZW(k, pt[0], pt[1], pt[2], pt[3]);
      const shown = c.tabs.slice(0, TAB.MAX);
      shown.forEach((tab, j) => {
        _a.makeTranslation(CARD.W / 2 - TAB.EDGE - TAB.W / 2 - (shown.length - 1 - j) * (TAB.W + TAB.GAP), CARD.H / 2, 0);
        tabs.setMatrixAt(nt, _a.premultiply(_m));
        tabColor.setXYZ(nt, tab.color[0], tab.color[1], tab.color[2]);
        const tt = tab.tile || [0, 0, 0, 0];
        tabTile.setXYZW(nt, tt[0], tt[1], tt[2], tt[3]);
        fades[1].setX(nt, c.fade || 0);
        nt++;
      });
      if (c.sticky) {
        _a.makeRotationZ(-0.1).setPosition(-CARD.W / 2 + 13, CARD.H / 2 - 13, CARD.T / 2 + 0.05);
        stickies.setMatrixAt(ns, _a.premultiply(_m));
        fades[2].setX(ns, c.fade || 0);
        ns++;
      }
    }
    stickies.count = ns;
    tabs.count = nt;
    paint(stickies, ns, tint.sticky);
    touch(cards, 'iTile', 'iColor', 'iFade', 'iHot', 'iPhoto', 'iHero', 'iPhotoTile');
    touch(tabs, 'iColor', 'iTile', 'iFade');
    touch(stickies, 'iFade');
  }

  function setShadows(list) {
    const inner = shadows.geometry.attributes.iInner;
    shadows.count = Math.min(list.length, 40);
    for (let k = 0; k < shadows.count; k++) {
      const s = list[k];
      pose(_m, s.x, 0.06, s.z + 2, 0, s.ry, s.w + 2 * SHADOW, 1, s.h + 2 * SHADOW);
      shadows.setMatrixAt(k, _m);
      inner.setXY(k, (s.w - 6) / (s.w + 2 * SHADOW), (s.h - 6) / (s.h + 2 * SHADOW));
      shadows.geometry.attributes.iFade.setX(k, s.fade || 0);
    }
    touch(shadows, 'iInner', 'iFade');
  }

  function setCabinet(cab, fade = 0) {
    pose(_m, 0, 0, cab.z - cab.depth / 2, 0, 0, cab.width, cab.height, cab.depth);
    body.setMatrixAt(0, _m);
    body.count = 1;
    body.geometry.attributes.iFade.setX(0, fade);
    paint(body, 1, tint.body);
    touch(body, 'iFade');
  }

  function setTray(t) {
    if (!t) {
      tray.count = 0;
      return;
    }
    const w = DRAWER.W - 8;
    const d = CAB.DEPTH - 20;
    const y0 = t.y - DRAWER.H / 2 + 2;
    const parts = [
      [t.x, y0, t.z - d / 2, w, TRAY.T, d],
      [t.x - w / 2 + TRAY.T / 2, y0, t.z - d / 2, TRAY.T, TRAY.SIDE, d],
      [t.x + w / 2 - TRAY.T / 2, y0, t.z - d / 2, TRAY.T, TRAY.SIDE, d],
      [t.x, y0, t.z - d + TRAY.T / 2, w, TRAY.SIDE + 10, TRAY.T],
    ];
    tray.count = parts.length;
    parts.forEach(([x, y, z, sx, sy, sz], k) => {
      pose(_m, x, y, z, 0, 0, sx, sy, sz);
      tray.setMatrixAt(k, _m);
      tray.geometry.attributes.iFade.setX(k, t.fade || 0);
    });
    paint(tray, tray.count, tint.handle);
    touch(tray, 'iFade');
  }

  function setDrawers(list) {
    const tile = fronts.geometry.attributes.iTile;
    fronts.count = handles.count = Math.min(list.length, maxDrawers);
    for (let k = 0; k < fronts.count; k++) {
      const d = list[k];
      pose(_m, d.x, d.y, d.z, 0, 0);
      fronts.setMatrixAt(k, _m);
      tile.setXYZW(k, d.tile[0], d.tile[1], d.tile[2], d.tile[3]);
      fronts.geometry.attributes.iFade.setX(k, d.fade || 0);
      fronts.geometry.attributes.iHot.setX(k, d.hot || 0);
      const tone = d.color || [0, 0, 0];
      fronts.geometry.attributes.iColor.setXYZ(k, tone[0], tone[1], tone[2]);
      pose(_m, d.x, d.y - HANDLE.DROP, d.z + DRAWER.D, 0, 0);
      handles.setMatrixAt(k, _m);
      handles.geometry.attributes.iFade.setX(k, d.fade || 0);
      const c = d.hot ? tint.edge : tint.handle;
      handles.geometry.attributes.iColor.setXYZ(k, c[0], c[1], c[2]);
    }
    handles.geometry.attributes.iColor.needsUpdate = true;
    touch(fronts, 'iTile', 'iFade', 'iHot', 'iColor');
    touch(handles, 'iFade');
  }

  function setHero(mask, photo) {
    colors.uHeroMask.value = mask;
    colors.uHeroPhoto.value = photo;
  }

  function setTextures(cardsTex, labelsTex, photosTex) {
    if (cardsTex) colors.uCards.value = cardsTex;
    if (labelsTex) colors.uLabels.value = labelsTex;
    if (photosTex) colors.uPhotos.value = photosTex;
  }

  const clear = new THREE.Color();
  const unlitColor = new THREE.Color();
  const view = { lamp: false, unlit: 0 };
  function applyClear() {
    clear.copy(colors.uDesk.value).multiplyScalar(view.lamp ? 0.4 : 1).lerp(unlitColor, view.unlit);
    renderer.setClearColor(clear, 1);
  }

  function setIntro(unlit, sketch) {
    view.unlit = unlit;
    colors.uUnlit.value.set(unlitColor.r, unlitColor.g, unlitColor.b, unlit);
    const k = renderer.getPixelRatio();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    colors.uSketch.value.set((w * k) / 2, (h * k) / 2, (Math.hypot(w, h) * k) / 2, sketch);
    applyClear();
  }

  function setColors(t) {
    const set = (name, v) => colors[name].value.setRGB(v[0], v[1], v[2]);
    set('uDesk', t.desk);
    set('uFace', t.face);
    set('uPaper', t.paper);
    set('uPaperDeep', t['paper-deep']);
    set('uInk', t.ink);
    set('uInk3', t['ink-3']);
    set('uEdge', t.edge);
    set('uEdgeNDeep', t['edge-n-deep']);
    tint.edge = t.edge.slice(0, 3);
    colors.uDrop.value.set(t['drop-near'][0], t['drop-near'][1], t['drop-near'][2], t['drop-near'][3]);
    tint.sticky = t.sticky.slice(0, 3);
    tint.body = t['edge-n'].slice(0, 3);
    tint.handle = t['edge-n-deep'].slice(0, 3);
    paint(body, body.count, tint.body);
    paint(stickies, stickies.count, tint.sticky);
    paint(tray, tray.count, tint.handle);
    common.uLampColor.value.setRGB(t.edge[0], t.edge[1], t.edge[2]).lerp(new THREE.Color(1, 1, 1), 0.45);
    unlitColor.setRGB(t.unlit[0], t.unlit[1], t.unlit[2]);
    colors.uUnlit.value.set(unlitColor.r, unlitColor.g, unlitColor.b, view.unlit);
    applyClear();
  }

  function setLamp(on, x = 0, y = 0, z = 0, reach = 380) {
    common.uLamp.value.set(x, y, z, on ? 1 : 0);
    common.uLampReach.value = reach;
    view.lamp = on;
    applyClear();
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  function deskPoint(x, y) {
    ndc.set((x / canvas.clientWidth) * 2 - 1, 1 - (y / canvas.clientHeight) * 2);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(floor, hit) ? [hit.x, hit.y, hit.z] : null;
  }

  const pickable = [cards, fronts, handles, body];
  function pick(x, y) {
    ndc.set((x / canvas.clientWidth) * 2 - 1, 1 - (y / canvas.clientHeight) * 2);
    raycaster.setFromCamera(ndc, camera);
    let best = null;
    pickable.forEach((mesh) => {
      if (!mesh.count) return;
      const h = raycaster.intersectObject(mesh, false)[0];
      if (h && (!best || h.distance < best.distance)) best = { mesh, distance: h.distance, id: h.instanceId };
    });
    if (!best || best.mesh === body) return null;
    return best.mesh === cards ? { kind: 'card', index: best.id } : { kind: 'drawer', index: best.id };
  }

  const _v = new THREE.Vector3();
  function heldPose(rect, dist) {
    const vh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const vw = vh * camera.aspect;
    const cx = ((rect.left + rect.width / 2) / canvas.clientWidth) * 2 - 1;
    const cy = 1 - ((rect.top + rect.height / 2) / canvas.clientHeight) * 2;
    _v.set((cx * vw) / 2, (cy * vh) / 2, -dist).applyMatrix4(camera.matrixWorld);
    const q = camera.quaternion;
    return { x: _v.x, y: _v.y, z: _v.z, q: [q.x, q.y, q.z, q.w], s: ((rect.width / canvas.clientWidth) * vw) / CARD.W };
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function aim(cam) {
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    camera.lookAt(cam.look[0], cam.look[1], cam.look[2]);
    camera.updateMatrixWorld();
  }

  function render(cam) {
    aim(cam);
    renderer.render(scene, camera);
  }

  function warm() {
    return renderer.compileAsync(scene, camera);
  }

  return { renderer, canvas, setCards, setShadows, setCabinet, setTray, setDrawers, setHero, setTextures, setColors, setLamp, deskPoint, pick, heldPose, aim, setIntro, resize, render, warm };
}
