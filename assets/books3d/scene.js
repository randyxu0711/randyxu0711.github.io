import * as THREE from 'three';
import { W, LIP } from 'books3d/layout.js';

export const SHELF_FRONT = 10;
export const SHELF_DEPTH = W + 30;
const SHADOW = 30;
const DIST = 1.5;
const EYE = 0.25;

function box(x0, x1, y0, y1, z0, z1) {
  const faces = [
    [[1, 0, 0], [x1, (y0 + y1) / 2, (z0 + z1) / 2], [0, 0, -(z1 - z0)], [0, y1 - y0, 0]],
    [[-1, 0, 0], [x0, (y0 + y1) / 2, (z0 + z1) / 2], [0, 0, z1 - z0], [0, y1 - y0, 0]],
    [[0, 1, 0], [(x0 + x1) / 2, y1, (z0 + z1) / 2], [x1 - x0, 0, 0], [0, 0, -(z1 - z0)]],
    [[0, -1, 0], [(x0 + x1) / 2, y0, (z0 + z1) / 2], [x1 - x0, 0, 0], [0, 0, z1 - z0]],
    [[0, 0, 1], [(x0 + x1) / 2, (y0 + y1) / 2, z1], [x1 - x0, 0, 0], [0, y1 - y0, 0]],
    [[0, 0, -1], [(x0 + x1) / 2, (y0 + y1) / 2, z0], [-(x1 - x0), 0, 0], [0, y1 - y0, 0]],
  ];
  const pos = [], nor = [], uv = [], face = [], index = [];
  faces.forEach(([n, c, u, v], f) => {
    const base = pos.length / 3;
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([a, b]) => {
      for (let k = 0; k < 3; k++) pos.push(c[k] + (a - 0.5) * u[k] + (b - 0.5) * v[k]);
      nor.push(...n);
      uv.push(a, b);
      face.push(f);
    });
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('face', new THREE.Float32BufferAttribute(face, 1));
  g.setIndex(index);
  return g;
}

const LIGHT = /* glsl */ `
uniform vec3 uLight;
uniform float uAmbient;
uniform float uKey;
uniform vec4 uLamp;
uniform vec3 uLampColor;
uniform float uLampReach;
varying vec3 vWorld;
vec3 lit(vec3 c, vec3 n) {
  vec3 nn = normalize(n);
  vec3 day = vec3(uAmbient + uKey * max(dot(nn, uLight), 0.0));
  vec3 d = uLamp.xyz - vWorld;
  float dist = length(d);
  float fall = 1.0 / (1.0 + pow(dist / uLampReach, 2.0));
  vec3 lamp = day * 0.4 + uLampColor * (1.3 * max(dot(nn, d / dist), 0.0) * fall);
  return c * mix(day, lamp, uLamp.w);
}
`;

const REVEAL = /* glsl */ `
uniform vec4 uSketch;
float sketchAmount() {
  if (uSketch.w > 2.0) return 0.0;
  vec2 p = (gl_FragCoord.xy - uSketch.xy) / uSketch.z;
  float d = length(p) + 0.05 * sin(p.x * 9.0 + p.y * 5.0) + 0.04 * sin(p.y * 13.0 - p.x * 7.0);
  return smoothstep(uSketch.w - 0.3, uSketch.w, d);
}
`;

const SKETCH = /* glsl */ `
${REVEAL}
uniform vec3 uInk;
vec3 sketch(vec3 col, vec3 n, vec2 uv) {
  float s = sketchAmount();
  if (s <= 0.0) return col;
  vec2 px = min(uv, 1.0 - uv) / max(fwidth(uv), vec2(1e-5));
  float line = 1.0 - smoothstep(0.5, 1.5, min(px.x, px.y));
  vec3 paper = mix(uDesk, uInk, 0.06 * (1.0 - max(dot(normalize(n), uLight), 0.0)));
  return mix(col, mix(paper, uInk, line * 0.75), s);
}
`;

const BOOK_VERT = /* glsl */ `
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
varying vec3 vN;
varying vec3 vLocal;
varying vec3 vSize;
varying vec2 vUv;
varying float vFace;
varying vec3 vWorld;
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = m * instanceMatrix;
#endif
  vec4 w = m * vec4(position, 1.0);
  vWorld = w.xyz;
  vSize = vec3(length(m[0].xyz), length(m[1].xyz), length(m[2].xyz));
  vN = mat3(m) * normal;
  vLocal = position;
  vUv = uv;
  vFace = face;
  vColor = iColor;
  vInk = iInk;
  vState = iState;
  vCover = iCover;
  vSpine = iSpine;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const BOOK_FRAG = /* glsl */ `
uniform vec3 uPaper;
uniform vec3 uPaperDeep;
uniform vec3 uEdge;
uniform sampler2D uCovers;
uniform sampler2D uSpines;
uniform vec3 uDesk;
uniform float uDim;
uniform vec4 uUnlit;
#ifdef HELD
uniform sampler2D uBack;
#endif
varying vec3 vColor;
varying vec3 vInk;
varying vec4 vState;
varying vec4 vCover;
varying vec4 vSpine;
varying vec3 vN;
varying vec3 vLocal;
varying vec3 vSize;
varying vec2 vUv;
varying float vFace;
${LIGHT}
${SKETCH}
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
void main() {
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
  gl_FragColor = vec4(mix(mix(sketch(lit(c, vN), vN, vUv), uDesk, uDim), uUnlit.rgb, uUnlit.a), 1.0);
}
`;

const SHELF_VERT = /* glsl */ `
attribute float face;
varying vec3 vN;
varying vec3 vLocal;
varying float vFace;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vUv = uv;
  vWorld = (m * vec4(position, 1.0)).xyz;
  vN = mat3(m) * normal;
  vLocal = position;
  vFace = face;
  gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
}
`;

const SHELF_FRAG = /* glsl */ `
uniform vec3 uShelf;
uniform vec3 uDesk;
uniform vec3 uEdgeN;
uniform float uDim;
uniform vec4 uUnlit;
varying vec3 vN;
varying vec3 vLocal;
varying float vFace;
varying vec2 vUv;
${LIGHT}
${SKETCH}
void main() {
  int f = int(vFace + 0.5);
  vec3 c = uShelf;
  if (f == 2) {
    float t = clamp((${SHELF_FRONT.toFixed(1)} - vLocal.z) / ${(SHELF_FRONT + SHELF_DEPTH).toFixed(1)}, 0.0, 1.0);
    c = mix(uShelf, mix(uShelf, uDesk, 0.45), t);
  } else if (f == 4) {
    c = mix(uShelf, uEdgeN, step(vLocal.y, -${(LIP * 0.64).toFixed(1)}));
    c = mix(c, vec3(1.0), 0.35 * (1.0 - smoothstep(0.0, 1.2, -vLocal.y)));
  } else {
    c = uEdgeN;
  }
  gl_FragColor = vec4(mix(mix(sketch(lit(c, vN), vN, vUv), uDesk, uDim), uUnlit.rgb, uUnlit.a), 1.0);
}
`;

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
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(camera);

  const common = {
    uLight: { value: new THREE.Vector3(-0.3, 0.55, 0.78).normalize() },
    uAmbient: { value: 0.6 },
    uKey: { value: 0.5 },
    uLamp: { value: new THREE.Vector4(0, 0, 0, 0) },
    uLampColor: { value: new THREE.Color(1, 0.85, 0.6) },
    uLampReach: { value: 500 },
  };
  const colors = {
    uPaper: { value: new THREE.Color() },
    uPaperDeep: { value: new THREE.Color() },
    uEdge: { value: new THREE.Color() },
    uShelf: { value: new THREE.Color() },
    uDesk: { value: new THREE.Color() },
    uEdgeN: { value: new THREE.Color() },
    uDrop: { value: new THREE.Vector4() },
    uCovers: { value: null },
    uSpines: { value: null },
    uDim: { value: 0 },
    uUnlit: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSketch: { value: new THREE.Vector4(0, 0, 1, 9) },
    uInk: { value: new THREE.Color() },
  };

  const n = books.length;
  const bookMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, common, colors),
    vertexShader: BOOK_VERT,
    fragmentShader: BOOK_FRAG,
  });
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
  bookMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(bookMesh);

  const MAX_SHELVES = n + 8;
  const shelfMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, common, colors),
    vertexShader: SHELF_VERT,
    fragmentShader: SHELF_FRAG,
  });
  const shelfMesh = new THREE.InstancedMesh(box(0, 1, -LIP, 0, -SHELF_DEPTH, SHELF_FRONT), shelfMat, MAX_SHELVES);
  shelfMesh.frustumCulled = false;
  shelfMesh.count = 0;
  scene.add(shelfMesh);

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
  const held = new THREE.Mesh(bookGeo, new THREE.ShaderMaterial({
    uniforms: heldUniforms,
    vertexShader: BOOK_VERT,
    fragmentShader: BOOK_FRAG,
    defines: { HELD: '' },
  }));
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
    u.iState.value.set(iState.getX(i), 0, 0, iState.getW(i));
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

  function setShelves(list) {
    shelfMesh.count = shadowMesh.count = Math.min(list.length, MAX_SHELVES);
    for (let k = 0; k < shelfMesh.count; k++) {
      const s = list[k];
      _m.makeScale(s.length, 1, 1).setPosition(s.x, s.y, 0);
      shelfMesh.setMatrixAt(k, _m);
      shadowMesh.setMatrixAt(k, _m);
    }
    shelfMesh.instanceMatrix.needsUpdate = true;
    shadowMesh.instanceMatrix.needsUpdate = true;
  }

  function setColors(t) {
    colors.uPaper.value.setRGB(...t.paper);
    colors.uPaperDeep.value.setRGB(...t['paper-deep']);
    colors.uEdge.value.setRGB(...t.edge);
    colors.uShelf.value.setRGB(...t.shelf);
    colors.uDesk.value.setRGB(...t.desk);
    colors.uEdgeN.value.setRGB(...t['edge-n']);
    colors.uDrop.value.set(...t['drop-near']);
    colors.uInk.value.setRGB(...t.ink);
    desk.setRGB(...t.desk);
    unlit.setRGB(...t.unlit);
    setUnlit(colors.uUnlit.value.w);
    common.uLampColor.value.setRGB(...t.edge).lerp(new THREE.Color(1, 1, 1), 0.45);
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
    const far = D + SHELF_DEPTH + 400;
    const k = near / D;
    camera.near = near;
    camera.far = far;
    camera.projectionMatrix.makePerspective(-cam.span / 2 * k, cam.span / 2 * k, EYE * hv * k, (EYE - 1) * hv * k, near, far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(x, y) {
    ndc.set(x / size.w * 2 - 1, 1 - y / size.h * 2);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(bookMesh, false)[0];
    return hit ? hit.instanceId : -1;
  }

  const lampPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -120);
  function setLamp(on, x, y, span) {
    common.uLamp.value.w = on ? 1 : 0;
    if (!on) return;
    ndc.set(x / size.w * 2 - 1, 1 - y / size.h * 2);
    raycaster.setFromCamera(ndc, camera);
    const p = raycaster.ray.intersectPlane(lampPlane, _v);
    if (p) common.uLamp.value.set(p.x, p.y, p.z, 1);
    common.uLampReach.value = span * 0.55;
  }

  function setLampAt(on, x, y, z, reach) {
    common.uLamp.value.set(x, y, z, on ? 1 : 0);
    common.uLampReach.value = reach;
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

  return { renderer, canvas, camera, bookMesh, setBook, booksChanged, setState, setAttr, setTextures, setShelves, setColors, resize, render, frustum, pick, pickHeld, holdBook, heldCover, setHeld, setDim, setUnlit, setSketch, project, view, canvasTexture, imageTexture, setLamp, setLampAt, warm };
}
