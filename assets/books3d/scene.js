import * as THREE from 'three';
import { W, LIP, carcass } from 'books3d/layout.js';
import { REVEAL, SKETCH, MATTER } from 'scene3d/glsl.js';
import { box } from 'scene3d/geometry.js';
import { standard } from 'scene3d/standard.js';
import { sunDir, lampDir } from 'scene3d/room.js';

export const SHELF_FRONT = 10;
export const SHELF_DEPTH = W + 30;
const SHADOW = 30;
const DIST = 1.5;
const EYE = 0.25;
const BACK_T = 8;
const SIDE_T = 18;
const LIGHTS = { SKY_DAY: 1.9, SKY_NIGHT: 0.9, SUN: 1.4, LAMP: 5.5, LAMP_ANGLE: 0.9 };

const BOOK_ATTRS = /* glsl */ `
attribute float face;
#ifdef HELD
uniform vec3 iColor;
uniform vec3 iInk;
uniform vec4 iState;
uniform vec4 iCover;
uniform vec4 iSpine;
#else
attribute vec3 iColor;
attribute vec3 iInk;
attribute vec4 iState;
attribute vec4 iCover;
attribute vec4 iSpine;
#endif
varying vec3 vColor;
varying vec3 vInk;
varying vec4 vState;
varying vec4 vCover;
varying vec4 vSpine;
varying vec3 vLocal;
varying vec3 vSize;
varying float vFace;
`;

const BOOK_VERTEX = /* glsl */ `
mat4 bm = modelMatrix;
#ifdef USE_INSTANCING
bm = bm * instanceMatrix;
#endif
vSize = vec3(length(bm[0].xyz), length(bm[1].xyz), length(bm[2].xyz));
vLocal = position;
vFace = face;
vColor = iColor;
vInk = iInk;
vState = iState;
vCover = iCover;
vSpine = iSpine;
`;

const SCENE_HEAD = /* glsl */ `
uniform vec3 uDesk;
uniform vec3 uLight;
uniform float uDim;
uniform vec4 uUnlit;
${SKETCH}
${MATTER}
`;

const BOOK_HEAD = SCENE_HEAD + `
uniform vec3 uPaper;
uniform vec3 uPaperDeep;
uniform vec3 uEdge;
uniform sampler2D uCovers;
uniform sampler2D uSpines;
#ifdef HELD
uniform sampler2D uBack;
#endif
varying vec3 vColor;
varying vec3 vInk;
varying vec4 vState;
varying vec4 vCover;
varying vec4 vSpine;
varying vec3 vLocal;
varying vec3 vSize;
varying float vFace;
float stripes(float x) {
  float s = x / 3.0;
  float aa = clamp(fwidth(s) * 1.5, 0.0, 1.0);
  return mix(step(0.66, fract(s)), 0.34, aa);
}
vec3 spineShade(vec3 c, float u) {
  vec4 g = u < 0.22 ? mix(vec4(0.0, 0.0, 0.0, 0.2), vec4(1.0, 1.0, 1.0, 0.1), u / 0.22)
    : u < 0.5 ? mix(vec4(1.0, 1.0, 1.0, 0.1), vec4(1.0, 1.0, 1.0, 0.04), (u - 0.22) / 0.28)
    : u < 0.78 ? mix(vec4(1.0, 1.0, 1.0, 0.04), vec4(1.0, 1.0, 1.0, 0.1), (u - 0.5) / 0.28)
    : mix(vec4(1.0, 1.0, 1.0, 0.1), vec4(0.0, 0.0, 0.0, 0.22), (u - 0.78) / 0.22);
  return mix(c, g.rgb, g.a);
}
`;

const BOOK_COLOR = /* glsl */ `
int f = int(vFace + 0.5);
float lx = vLocal.x * vSize.x;
float ly = vLocal.y * vSize.y;
float lz = vLocal.z * vSize.z;
vec3 c = vColor;
if (f == 2 || f == 5) {
  float board = step(vSize.x * 0.5 - 1.3, abs(lx));
  if (f == 2) board = max(board, step(vSize.z * 0.5 - 2.0, lz));
  c = mix(mix(uPaper, uPaperDeep, stripes(lx + vSize.x * 0.5)), vColor, board);
} else if (f == 3) {
  c = uPaperDeep;
} else if (f == 4) {
  c = spineShade(c, vUv.x);
  if (vState.w > 0.0) c = mix(c, vInk, vState.w * texture2D(uSpines, vSpine.xy + vec2(vUv.x, 1.0 - vUv.y) * vSpine.zw).r);
} else if (f == 0) {
  if (vState.x > 0.0) c = mix(c, texture2D(uCovers, vCover.xy + vUv * vCover.zw).rgb, vState.x);
  float u = vUv.x;
  c = mix(c, vec3(0.0), 0.22 * (1.0 - smoothstep(0.0, 0.06, u)));
  c = mix(c, vec3(1.0), 0.08 * smoothstep(0.06, 0.08, u) * (1.0 - smoothstep(0.08, 0.13, u)));
} else if (f == 1) {
#ifdef HELD
  c = texture2D(uBack, vUv).rgb;
#else
  c = mix(c, vec3(1.0), 0.06);
#endif
}
if (f == 0 || f == 4) c = mix(c, uEdge, vState.y * (1.0 - smoothstep(2.6, 3.6, ly)));
if (f != 2 && f != 3) c *= mix(1.0, mix(0.8, 1.0, smoothstep(0.0, 14.0, ly)), vState.z);
diffuseColor.rgb = c;
`;

const FINISH = /* glsl */ `
gl_FragColor.rgb = mix(mix(sketch(gl_FragColor.rgb, inverseTransformDirection(normal, viewMatrix), vUv), uDesk, uDim), uUnlit.rgb, uUnlit.a);
`;

const HELD_FINISH = 'gl_FragColor.rgb = diffuseColor.rgb * (0.78 + 0.27 * max(dot(inverseTransformDirection(normal, viewMatrix), uLight), 0.0));';

const SHELF_ATTRS = /* glsl */ `
attribute float face;
varying vec3 vLocal;
varying float vFace;
`;

const SHELF_HEAD = SCENE_HEAD + `
uniform vec3 uShelf;
varying vec3 vLocal;
varying float vFace;
`;

const SHELF_COLOR = /* glsl */ `
int f = int(vFace + 0.5);
vec3 c = uShelf * wood(vec2(vWorld.x, vWorld.z * 3.0 + vWorld.y), 0.14);
if (f == 4) c = mix(c, vec3(1.0), 0.25 * (1.0 - smoothstep(0.0, 1.2, -vLocal.y)));
else if (f != 2) c *= 0.85;
diffuseColor.rgb = c;
`;

const CASE_ATTRS = /* glsl */ `
attribute float iTone;
varying float vTone;
`;

const CASE_HEAD = SCENE_HEAD + `
uniform vec3 uShelf;
varying float vTone;
`;

const CASE_COLOR = 'diffuseColor.rgb = uShelf * vTone * wood(vec2(vWorld.x + vWorld.z, vWorld.y * 0.2), 0.12);';

const SHADOW_VERT = /* glsl */ `
varying float vT;
void main() {
  vT = uv.y;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const SHADOW_FRAG = /* glsl */ `
uniform vec4 uDrop;
uniform float uDim;
uniform vec4 uUnlit;
varying float vT;
${REVEAL}
void main() {
  gl_FragColor = vec4(mix(uDrop.rgb, uUnlit.rgb, uUnlit.a), uDrop.a * vT * vT * (1.0 - uDim) * (1.0 - sketchAmount()));
}
`;

export function createScene(books, dims) {
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(camera);

  const common = {
    uLight: { value: new THREE.Vector3(...sunDir('books')) },
  };
  const colors = {
    uPaper: { value: new THREE.Color() },
    uPaperDeep: { value: new THREE.Color() },
    uEdge: { value: new THREE.Color() },
    uShelf: { value: new THREE.Color() },
    uDesk: { value: new THREE.Color() },
    uDrop: { value: new THREE.Vector4() },
    uCovers: { value: null },
    uSpines: { value: null },
    uDim: { value: 0 },
    uUnlit: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSketch: { value: new THREE.Vector4(0, 0, 1, 9) },
    uInk: { value: new THREE.Color() },
  };

  const sky = new THREE.HemisphereLight(0xffffff, 0xffffff, LIGHTS.SKY_DAY);
  const sun = new THREE.DirectionalLight(0xffffff, LIGHTS.SUN);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 1.5;
  const lamp = new THREE.SpotLight(0xffffff, LIGHTS.LAMP, 0, LIGHTS.LAMP_ANGLE, 1, 0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0005;
  lamp.shadow.normalBias = 1.5;
  lamp.visible = false;
  scene.add(sky, sun, sun.target, lamp, lamp.target);
  const lights = { on: false, night: false };

  const uniforms = Object.assign({}, common, colors);
  const n = books.length;
  const bookMat = standard({ params: { roughness: 0.8 }, uniforms, attrs: BOOK_ATTRS, vertex: BOOK_VERTEX, head: BOOK_HEAD, color: BOOK_COLOR, finish: FINISH });
  const bookGeo = box(-0.5, 0.5, 0, 1, -0.5, 0.5);
  const iColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const iInk = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const iState = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  const attrs = {
    iState,
    iCover: new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4),
    iSpine: new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4),
  };
  books.forEach((b, i) => {
    iColor.setXYZ(i, ...dims[i].color);
    iInk.setXYZ(i, ...dims[i].ink);
    iState.setXYZW(i, 0, 0, 1, 0);
  });
  bookGeo.setAttribute('iColor', iColor);
  bookGeo.setAttribute('iInk', iInk);
  Object.keys(attrs).forEach((k) => bookGeo.setAttribute(k, attrs[k]));
  const bookMesh = new THREE.InstancedMesh(bookGeo, bookMat, n);
  bookMesh.frustumCulled = false;
  bookMesh.castShadow = true;
  bookMesh.receiveShadow = true;
  bookMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(bookMesh);

  const MAX_SHELVES = n + 8;
  const shelfMat = standard({ params: { roughness: 0.7 }, uniforms, attrs: SHELF_ATTRS, vertex: 'vLocal = position; vFace = face;', head: SHELF_HEAD, color: SHELF_COLOR, finish: FINISH });
  const shelfMesh = new THREE.InstancedMesh(box(0, 1, -LIP, 0, -SHELF_DEPTH, SHELF_FRONT), shelfMat, MAX_SHELVES);
  shelfMesh.frustumCulled = false;
  shelfMesh.count = 0;
  shelfMesh.castShadow = true;
  shelfMesh.receiveShadow = true;
  scene.add(shelfMesh);

  const caseGeo = box(0, 1, 0, 1, 0, 1);
  const iTone = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHELVES * 3), 1);
  caseGeo.setAttribute('iTone', iTone);
  const caseMat = standard({ params: { roughness: 0.75 }, uniforms, attrs: CASE_ATTRS, vertex: 'vTone = iTone;', head: CASE_HEAD, color: CASE_COLOR, finish: FINISH });
  const caseMesh = new THREE.InstancedMesh(caseGeo, caseMat, MAX_SHELVES * 3);
  caseMesh.frustumCulled = false;
  caseMesh.count = 0;
  caseMesh.castShadow = true;
  caseMesh.receiveShadow = true;
  scene.add(caseMesh);

  let rows = [];
  let corner = null;
  function setCorner(x) {
    corner = x;
    setShelves(rows);
  }

  const shadowGeo = new THREE.PlaneGeometry(1, SHADOW);
  shadowGeo.translate(0.5, -LIP - SHADOW / 2, SHELF_FRONT - 1);
  const shadowMat = new THREE.ShaderMaterial({
    uniforms: { uDrop: colors.uDrop, uDim: colors.uDim, uUnlit: colors.uUnlit, uSketch: colors.uSketch, uInk: colors.uInk },
    vertexShader: SHADOW_VERT,
    fragmentShader: SHADOW_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const shadowMesh = new THREE.InstancedMesh(shadowGeo, shadowMat, MAX_SHELVES);
  shadowMesh.frustumCulled = false;
  shadowMesh.count = 0;
  scene.add(shadowMesh);

  const _m = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _r = new THREE.Matrix4();
  const _t = new THREE.Matrix4();

  function pivot(m, axis, angle, px, py, pz) {
    if (!angle) return;
    if (axis === 'z') _r.makeRotationZ(angle);
    else _r.makeRotationX(angle);
    _t.makeTranslation(-px, -py, -pz);
    m.premultiply(_t).premultiply(_r);
    _t.makeTranslation(px, py, pz);
    m.premultiply(_t);
  }

  function compose(m, b) {
    _q.setFromAxisAngle(_up, b.rot);
    m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(b.sx, b.sy, b.sz));
    pivot(m, 'x', b.brush, 0, b.y, b.front);
    pivot(m, 'z', b.lean, b.pivot, b.y, 0);
    return m;
  }

  function setBook(i, b) {
    bookMesh.setMatrixAt(i, compose(_m, b));
  }

  const heldUniforms = Object.assign({}, common, colors, {
    uDim: { value: 0 },
    uCovers: { value: null },
    uBack: { value: null },
    iColor: { value: new THREE.Color() },
    iInk: { value: new THREE.Color() },
    iState: { value: new THREE.Vector4(0, 0, 0, 0) },
    iCover: { value: new THREE.Vector4() },
    iSpine: { value: new THREE.Vector4() },
  });
  const heldMat = standard({ params: { roughness: 0.8 }, uniforms: heldUniforms, attrs: BOOK_ATTRS, vertex: BOOK_VERTEX, head: BOOK_HEAD, color: BOOK_COLOR, finish: HELD_FINISH + FINISH });
  heldMat.defines.HELD = '';
  const held = new THREE.Mesh(bookGeo, heldMat);
  held.matrixAutoUpdate = false;
  held.frustumCulled = false;
  held.visible = false;
  held.renderOrder = 1;
  held.onBeforeRender = (r) => r.clearDepth();
  scene.add(held);

  function holdBook(i, back) {
    if (i < 0) {
      held.visible = false;
      return;
    }
    const u = heldUniforms;
    u.iColor.value.setRGB(...dims[i].color);
    u.iInk.value.setRGB(...dims[i].ink);
    u.iState.value.set(iState.getX(i) > 0 ? 1 : 0, 0, 0, iState.getW(i) > 0 ? 1 : 0);
    u.iCover.value.fromBufferAttribute(attrs.iCover, i);
    u.iSpine.value.fromBufferAttribute(attrs.iSpine, i);
    u.uCovers.value = colors.uCovers.value;
    u.uBack.value = back;
    held.visible = true;
  }

  function heldCover(tex) {
    heldUniforms.uCovers.value = tex;
    heldUniforms.iCover.value.set(0, 0, 1, 1);
    heldUniforms.iState.value.x = 1;
  }

  function setHeld(b) {
    compose(held.matrix, b);
    held.matrixWorldNeedsUpdate = true;
  }

  function canvasTexture(c) {
    return new THREE.CanvasTexture(c);
  }

  function imageTexture(img) {
    const tex = new THREE.Texture(img);
    tex.needsUpdate = true;
    return tex;
  }

  function setDim(v) {
    colors.uDim.value = v;
  }

  const desk = new THREE.Color();
  const unlit = new THREE.Color();
  const clear = new THREE.Color();
  function setUnlit(a) {
    colors.uUnlit.value.set(unlit.r, unlit.g, unlit.b, a);
    renderer.setClearColor(clear.copy(desk).lerp(unlit, a), 1);
  }

  const _v = new THREE.Vector3();
  function project(lx, ly, lz) {
    _v.set(lx, ly, lz).applyMatrix4(held.matrix).project(camera);
    return { x: (_v.x + 1) / 2 * size.w, y: (1 - _v.y) / 2 * size.h };
  }

  function booksChanged() {
    bookMesh.instanceMatrix.needsUpdate = true;
    bookMesh.boundingSphere = null;
  }

  function setState(i, k, v) {
    iState.array[i * 4 + k] = v;
    iState.needsUpdate = true;
  }

  function setAttr(name, i, x, y, z, w) {
    attrs[name].setXYZW(i, x, y, z, w);
    attrs[name].needsUpdate = true;
  }

  function setTextures(covers, spines) {
    colors.uCovers.value = covers;
    colors.uSpines.value = spines;
  }

  function setShelves(next) {
    rows = next;
    const list = corner === null ? rows : rows.map((r) => ({ ...r, length: Math.max(r.length, corner - SIDE_T - r.x) }));
    shelfMesh.count = shadowMesh.count = Math.min(list.length, MAX_SHELVES);
    for (let k = 0; k < shelfMesh.count; k++) {
      const s = list[k];
      _m.makeScale(s.length, 1, 1).setPosition(s.x, s.y, 0);
      shelfMesh.setMatrixAt(k, _m);
      shadowMesh.setMatrixAt(k, _m);
    }
    shelfMesh.instanceMatrix.needsUpdate = true;
    shadowMesh.instanceMatrix.needsUpdate = true;
    const parts = carcass(list.slice(0, shelfMesh.count));
    caseMesh.count = parts.length;
    parts.forEach((q, k) => {
      if (q.kind === 'back') _m.makeScale(q.w, q.h, BACK_T).setPosition(q.x, q.y, -SHELF_DEPTH - BACK_T);
      else _m.makeScale(q.w, q.h, SHELF_DEPTH + SHELF_FRONT).setPosition(q.x, q.y, -SHELF_DEPTH);
      caseMesh.setMatrixAt(k, _m);
      iTone.setX(k, q.kind === 'back' ? 0.62 : 1);
    });
    if (corner !== null && parts.length) {
      const top = Math.max(...parts.map((q) => q.y + q.h));
      const bottom = Math.min(...parts.map((q) => q.y));
      _m.makeScale(SIDE_T, top - bottom, SHELF_DEPTH + BACK_T + SHELF_FRONT).setPosition(corner - SIDE_T, bottom, -SHELF_DEPTH - BACK_T);
      caseMesh.setMatrixAt(parts.length, _m);
      iTone.setX(parts.length, 1);
      caseMesh.count++;
    }
    caseMesh.instanceMatrix.needsUpdate = true;
    iTone.needsUpdate = true;
  }

  function setColors(t) {
    colors.uPaper.value.setRGB(...t.paper);
    colors.uPaperDeep.value.setRGB(...t['paper-deep']);
    colors.uEdge.value.setRGB(...t.edge);
    colors.uShelf.value.setRGB(...t.oak);
    colors.uDesk.value.setRGB(...t.desk);
    colors.uDrop.value.set(...t['drop-near']);
    colors.uInk.value.setRGB(...t.ink);
    desk.setRGB(...t.desk);
    unlit.setRGB(...t.unlit);
    setUnlit(colors.uUnlit.value.w);
    lamp.color.setRGB(...t.lamp);
    sky.groundColor.setRGB(...t.desk);
  }

  function setSketch(r) {
    const k = renderer.getPixelRatio();
    colors.uSketch.value.set(size.w * k / 2, size.h * k / 2, Math.hypot(size.w, size.h) * k / 2, r);
  }

  let size = { w: 0, h: 0 };
  function resize(w, h) {
    if (w === size.w && h === size.h) return;
    size = { w, h };
    renderer.setSize(w, h, false);
  }

  const view = { D: 1, eyeY: 0, hv: 1 };
  function frustum(cam) {
    const hv = cam.span * size.h / size.w;
    const D = Math.max(cam.span, hv) * DIST;
    const eyeY = cam.yTop - EYE * hv;
    Object.assign(view, { D, eyeY, hv });
    camera.position.set(cam.cx, eyeY, D);
    camera.updateMatrixWorld();
    const near = Math.max(1, D * 0.05);
    const far = D * 2 + SHELF_DEPTH + 400;
    const k = near / D;
    camera.near = near;
    camera.far = far;
    camera.projectionMatrix.makePerspective(-cam.span / 2 * k, cam.span / 2 * k, EYE * hv * k, (EYE - 1) * hv * k, near, far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    aimLights(cam.cx, eyeY + (EYE - 0.5) * hv, Math.max(cam.span, hv));
  }

  function aimLights(cx, cy, size) {
    const d = sunDir('books');
    const far = size * 2;
    sun.target.position.set(cx, cy, 0);
    sun.position.set(cx + d[0] * far, cy + d[1] * far, d[2] * far);
    Object.assign(sun.shadow.camera, { left: -size * 0.7, right: size * 0.7, top: size * 0.7, bottom: -size * 0.7, near: far * 0.5, far: far * 1.6 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
    const l = lampDir('books');
    const reach = size * 1.1;
    lamp.position.set(cx + l[0] * reach, cy + l[1] * reach, l[2] * reach);
    lamp.target.position.set(cx + size * 0.12, cy, 0);
    lamp.shadow.camera.near = reach * 0.3;
    lamp.shadow.camera.far = reach * 2.5;
    lamp.target.updateMatrixWorld();
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(x, y) {
    ndc.set(x / size.w * 2 - 1, 1 - y / size.h * 2);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(bookMesh, false)[0];
    return hit ? hit.instanceId : -1;
  }

  function setLamp(on, night = on) {
    if (lights.on === on && lights.night === night) return;
    lamp.visible = night;
    lamp.intensity = on ? LIGHTS.LAMP : 0;
    sun.visible = !night;
    sky.intensity = night ? LIGHTS.SKY_NIGHT : LIGHTS.SKY_DAY;
    lights.on = on;
    lights.night = night;
  }

  function pickHeld(x, y) {
    if (!held.visible) return false;
    held.updateMatrixWorld(true);
    ndc.set(x / size.w * 2 - 1, 1 - y / size.h * 2);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(held, false).length > 0;
  }

  function warm() {
    return renderer.compileAsync(scene, camera);
  }

  function render(cam) {
    frustum(cam);
    renderer.render(scene, camera);
  }

  function draw() {
    renderer.render(scene, camera);
  }

  return { renderer, canvas, camera, bookMesh, setBook, booksChanged, setState, setAttr, setTextures, setShelves, setColors, resize, render, draw, frustum, pick, pickHeld, holdBook, heldCover, setHeld, setDim, setUnlit, setSketch, project, view, canvasTexture, imageTexture, setLamp, warm, setCorner };
}
