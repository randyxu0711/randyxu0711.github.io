import * as THREE from 'three';
import { LIGHT, REVEAL, SKETCH } from 'scene3d/glsl.js';
import { box } from 'scene3d/geometry.js';
import { CARD, DRAWER, FOV } from 'shares3d/layout.js';

const TAB = { W: 28, H: 9 };
const STICKY = 30;
const HANDLE = { W: 32, H: 6, D: 6, DROP: 22 };
const LABEL = { W: 140, H: 17.5 };
const SHADOW = 9;

const FINISH = 'gl_FragColor = vec4(mix(mix(sketch(lit(c, vN), vN, vUv), uDesk, uDim), uUnlit.rgb, uUnlit.a), 1.0);';

const INST_VERT = /* glsl */ `
attribute float face;
attribute vec4 iTile;
attribute vec3 iColor;
varying vec4 vTile;
varying vec3 vColor;
varying vec3 vN;
varying vec2 vUv;
varying float vFace;
varying vec3 vWorld;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
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
${LIGHT}
${SKETCH}
`;

const CARD_FRAG = /* glsl */ `
uniform sampler2D uCards;
uniform vec3 uFace;
uniform vec3 uPaper;
uniform vec3 uPaperDeep;
uniform vec3 uInk3;
uniform vec3 uRule;
uniform vec3 uRedline;
${INST_HEAD}
float hairline(float d, float w, float aa) {
  return 1.0 - smoothstep(w, w + aa, d);
}
void main() {
  int f = int(vFace + 0.5);
  float ty = (1.0 - vUv.y) * ${CARD.H.toFixed(2)};
  float aa = fwidth(ty);
  vec3 m = texture2D(uCards, vTile.xy + vUv * vTile.zw).rgb * step(0.0001, vTile.z);
  float rule = hairline(abs(mod(ty - 30.88 + 3.76, 7.52) - 3.76), 0.18, aa) * step(29.0, ty) * step(ty, 74.5);
  float red = hairline(abs(ty - 15.83), 0.3, aa);
  vec3 c = uPaperDeep;
  if (f == 4) {
    c = mix(uFace, uRule, rule);
    c = mix(c, uRedline, red);
    c = mix(c, uInk, m.r);
    c = mix(c, uInk3, m.g);
    c = mix(c, vColor, m.b * 0.85);
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

const DRAWER_FRAG = /* glsl */ `
uniform sampler2D uLabels;
uniform vec3 uFace;
uniform vec3 uInk3;
uniform vec3 uEdgeNDeep;
${INST_HEAD}
void main() {
  int f = int(vFace + 0.5);
  vec3 m = texture2D(uLabels, vTile.xy + vUv * vTile.zw).rgb * step(0.0001, vTile.z);
  vec3 c = uEdgeNDeep;
  if (f == 4) {
    c = mix(uFace, uInk, m.r);
    c = mix(c, uInk3, m.g);
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
varying vec4 vTile;
varying vec2 vInner;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
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
${REVEAL}
void main() {
  vec2 q = max(abs(vUv * 2.0 - 1.0) - vInner, 0.0) / max(1.0 - vInner, vec2(0.001));
  float a = 1.0 - smoothstep(0.0, 1.0, length(q));
  gl_FragColor = vec4(mix(uDrop.rgb, uUnlit.rgb, uUnlit.a), uDrop.a * a * a * (1.0 - uDim) * (1.0 - sketchAmount()));
}
`;

const LABEL_FRAG = /* glsl */ `
uniform sampler2D uLabels;
uniform vec3 uInk3;
uniform vec4 uUnlit;
varying vec4 vTile;
varying vec2 vUv;
${LIGHT}
${REVEAL}
void main() {
  float a = texture2D(uLabels, vTile.xy + vUv * vTile.zw).r;
  vec3 c = lit(uInk3, vec3(0.0, 1.0, 0.0));
  gl_FragColor = vec4(mix(c, uUnlit.rgb, uUnlit.a), a * 0.9 * (1.0 - sketchAmount()));
}
`;

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
    uFace: { value: new THREE.Color() },
    uPaper: { value: new THREE.Color() },
    uPaperDeep: { value: new THREE.Color() },
    uInk: { value: new THREE.Color() },
    uInk3: { value: new THREE.Color() },
    uRule: { value: new THREE.Color() },
    uRedline: { value: new THREE.Color() },
    uEdgeNDeep: { value: new THREE.Color() },
    uDrop: { value: new THREE.Vector4() },
    uDim: { value: 0 },
    uUnlit: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSketch: { value: new THREE.Vector4(0, 0, 1, 9) },
    uCards: { value: null },
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
  const solidAttrs = { iTile: 4, iColor: 3 };
  const flatGeo = (w, h) => new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2);

  const desk = new THREE.Mesh(flatGeo(8000, 8000), material(DESK_VERT, DESK_FRAG));
  desk.position.z = -1000;
  scene.add(desk);

  const maxDrawers = n + 32;
  const shadows = instanced(flatGeo(1, 1), material(FLAT_VERT, SHADOW_FRAG, { transparent: true, depthWrite: false }), 40, { iTile: 4, iInner: 2 });
  const labels = instanced(flatGeo(LABEL.W, LABEL.H), material(FLAT_VERT, LABEL_FRAG, { transparent: true, depthWrite: false }), 12, { iTile: 4, iInner: 2 });
  const cards = instanced(box(-CARD.W / 2, CARD.W / 2, -CARD.H / 2, CARD.H / 2, -CARD.T / 2, CARD.T / 2), material(INST_VERT, CARD_FRAG), n, solidAttrs);
  const solidMat = material(INST_VERT, SOLID_FRAG);
  const tabs = instanced(box(-TAB.W / 2, TAB.W / 2, -1, TAB.H, -CARD.T / 2, CARD.T / 2), solidMat, n, solidAttrs);
  const stickies = instanced(box(-STICKY / 2, STICKY / 2, -STICKY / 2, STICKY / 2, 0, 0.3), solidMat, n, solidAttrs);
  const body = instanced(box(-0.5, 0.5, 0, 1, -0.5, 0.5), solidMat, 1, solidAttrs);
  const fronts = instanced(box(-DRAWER.W / 2, DRAWER.W / 2, -DRAWER.H / 2, DRAWER.H / 2, 0, DRAWER.D), material(INST_VERT, DRAWER_FRAG), maxDrawers, solidAttrs);
  const handles = instanced(box(-HANDLE.W / 2, HANDLE.W / 2, -HANDLE.H / 2, HANDLE.H / 2, 0, HANDLE.D), solidMat, maxDrawers, solidAttrs);

  const _m = new THREE.Matrix4();
  const _a = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const tint = { sticky: [1, 1, 0.6], body: [0.5, 0.5, 0.5], handle: [0.4, 0.4, 0.4] };

  function pose(m, x, y, z, rx, ry, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, 0, 'YXZ');
    _q.setFromEuler(_e);
    return m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  }
  function touch(mesh, ...names) {
    mesh.instanceMatrix.needsUpdate = true;
    names.forEach((k) => { mesh.geometry.attributes[k].needsUpdate = true; });
  }
  function paint(mesh, count, rgb) {
    const a = mesh.geometry.attributes.iColor;
    for (let k = 0; k < count; k++) a.setXYZ(k, rgb[0], rgb[1], rgb[2]);
    a.needsUpdate = true;
  }

  function setCards(list) {
    const tile = cards.geometry.attributes.iTile;
    const stamp = cards.geometry.attributes.iColor;
    const tabColor = tabs.geometry.attributes.iColor;
    let ns = 0;
    cards.count = tabs.count = list.length;
    list.forEach((c, k) => {
      pose(_m, c.x, c.y, c.z, c.rx, c.ry);
      cards.setMatrixAt(k, _m);
      const t = c.tile || [0, 0, 0, 0];
      tile.setXYZW(k, t[0], t[1], t[2], t[3]);
      stamp.setXYZ(k, c.stamp[0], c.stamp[1], c.stamp[2]);
      _a.makeTranslation(c.tab.x, CARD.H / 2, 0);
      tabs.setMatrixAt(k, _a.premultiply(_m));
      tabColor.setXYZ(k, c.tab.color[0], c.tab.color[1], c.tab.color[2]);
      if (c.sticky) {
        _a.makeRotationZ(0.12).setPosition(CARD.W / 2 - 18, -CARD.H / 2 + 18, CARD.T / 2 + 0.05);
        stickies.setMatrixAt(ns++, _a.premultiply(_m));
      }
    });
    stickies.count = ns;
    paint(stickies, ns, tint.sticky);
    touch(cards, 'iTile', 'iColor');
    touch(tabs, 'iColor');
    touch(stickies);
  }

  function setShadows(list) {
    const inner = shadows.geometry.attributes.iInner;
    shadows.count = Math.min(list.length, 40);
    for (let k = 0; k < shadows.count; k++) {
      const s = list[k];
      pose(_m, s.x, 0.06, s.z + 2, 0, s.ry, s.w + 2 * SHADOW, 1, s.h + 2 * SHADOW);
      shadows.setMatrixAt(k, _m);
      inner.setXY(k, (s.w - 6) / (s.w + 2 * SHADOW), (s.h - 6) / (s.h + 2 * SHADOW));
    }
    touch(shadows, 'iInner');
  }

  function setCabinet(cab) {
    pose(_m, 0, 0, cab.z - cab.depth / 2, 0, 0, cab.width, cab.height, cab.depth);
    body.setMatrixAt(0, _m);
    body.count = 1;
    paint(body, 1, tint.body);
    touch(body);
  }

  function setDrawers(list) {
    const tile = fronts.geometry.attributes.iTile;
    fronts.count = handles.count = Math.min(list.length, maxDrawers);
    for (let k = 0; k < fronts.count; k++) {
      const d = list[k];
      pose(_m, d.x, d.y, d.z, 0, 0);
      fronts.setMatrixAt(k, _m);
      tile.setXYZW(k, d.tile[0], d.tile[1], d.tile[2], d.tile[3]);
      pose(_m, d.x, d.y - HANDLE.DROP, d.z + DRAWER.D, 0, 0);
      handles.setMatrixAt(k, _m);
    }
    paint(handles, handles.count, tint.handle);
    touch(fronts, 'iTile');
    touch(handles);
  }

  function setPileLabels(list) {
    const tile = labels.geometry.attributes.iTile;
    labels.count = Math.min(list.length, 12);
    for (let k = 0; k < labels.count; k++) {
      const l = list[k];
      pose(_m, l.x, 0.07, l.z, 0, 0);
      labels.setMatrixAt(k, _m);
      tile.setXYZW(k, l.tile[0], l.tile[1], l.tile[2], l.tile[3]);
    }
    touch(labels, 'iTile');
  }

  function setTextures(cardsTex, labelsTex) {
    if (cardsTex) colors.uCards.value = cardsTex;
    if (labelsTex) colors.uLabels.value = labelsTex;
  }

  const clear = new THREE.Color();
  function setColors(t) {
    const set = (name, v) => colors[name].value.setRGB(v[0], v[1], v[2]);
    set('uDesk', t.desk);
    set('uFace', t.face);
    set('uPaper', t.paper);
    set('uPaperDeep', t['paper-deep']);
    set('uInk', t.ink);
    set('uInk3', t['ink-3']);
    set('uRule', t.rule);
    set('uRedline', t.redline);
    set('uEdgeNDeep', t['edge-n-deep']);
    colors.uDrop.value.set(t['drop-near'][0], t['drop-near'][1], t['drop-near'][2], t['drop-near'][3]);
    tint.sticky = t.sticky.slice(0, 3);
    tint.body = t['edge-n'].slice(0, 3);
    tint.handle = t['edge-n-deep'].slice(0, 3);
    paint(body, body.count, tint.body);
    paint(handles, handles.count, tint.handle);
    paint(stickies, stickies.count, tint.sticky);
    common.uLampColor.value.setRGB(t.edge[0], t.edge[1], t.edge[2]).lerp(new THREE.Color(1, 1, 1), 0.45);
    renderer.setClearColor(clear.setRGB(t.desk[0], t.desk[1], t.desk[2]), 1);
  }

  function setLamp(on, x = 0, y = 0, z = 0, reach = 380) {
    common.uLamp.value.set(x, y, z, on ? 1 : 0);
    common.uLampReach.value = reach;
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

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function render(cam) {
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    camera.lookAt(cam.look[0], cam.look[1], cam.look[2]);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
  }

  function warm() {
    return renderer.compileAsync(scene, camera);
  }

  return { renderer, canvas, setCards, setShadows, setCabinet, setDrawers, setPileLabels, setTextures, setColors, setLamp, deskPoint, resize, render, warm };
}
