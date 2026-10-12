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
vec3 lit(vec3 c, vec3 n) {
  return c * (uAmbient + uKey * max(dot(normalize(n), uLight), 0.0));
}
`;

const BOOK_VERT = /* glsl */ `
attribute float face;
attribute vec3 iColor;
attribute vec3 iInk;
attribute vec4 iState;
attribute vec4 iCover;
attribute vec4 iSpine;
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
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = m * instanceMatrix;
#endif
  vec4 w = m * vec4(position, 1.0);
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
    if (vState.w > 0.5) c = mix(c, vInk, texture2D(uSpines, vSpine.xy + vec2(vUv.x, 1.0 - vUv.y) * vSpine.zw).r);
  } else if (f == 0) {
    if (vState.x > 0.5) c = texture2D(uCovers, vCover.xy + vUv * vCover.zw).rgb;
    float u = vUv.x;
    c = mix(c, vec3(0.0), 0.22 * (1.0 - smoothstep(0.0, 0.06, u)));
    c = mix(c, vec3(1.0), 0.08 * smoothstep(0.06, 0.08, u) * (1.0 - smoothstep(0.08, 0.13, u)));
  } else if (f == 1) {
    c = mix(c, vec3(1.0), 0.06);
  }
  if (f == 0 || f == 4) c = mix(c, uEdge, vState.y * (1.0 - smoothstep(2.6, 3.6, ly)));
  if (f != 2 && f != 3) c *= mix(1.0, mix(0.8, 1.0, smoothstep(0.0, 14.0, ly)), vState.z);
  gl_FragColor = vec4(lit(c, vN), 1.0);
}
`;

const SHELF_VERT = /* glsl */ `
attribute float face;
varying vec3 vN;
varying vec3 vLocal;
varying float vFace;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
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
varying vec3 vN;
varying vec3 vLocal;
varying float vFace;
${LIGHT}
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
  gl_FragColor = vec4(lit(c, vN), 1.0);
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
varying float vT;
void main() {
  gl_FragColor = vec4(uDrop.rgb, uDrop.a * vT * vT);
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

  const MAX_SHELVES = 128;
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
    uniforms: { uDrop: colors.uDrop },
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

  function setBook(i, x, y, z, rot, sx, sy, sz) {
    _q.setFromAxisAngle(_up, rot);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    bookMesh.setMatrixAt(i, _m);
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
    renderer.setClearColor(new THREE.Color(...t.desk), 1);
  }

  let size = { w: 0, h: 0 };
  function resize(w, h) {
    if (w === size.w && h === size.h) return;
    size = { w, h };
    renderer.setSize(w, h, false);
  }

  function frustum(cam) {
    const D = cam.span * DIST;
    const hv = cam.span * size.h / size.w;
    const eyeY = cam.yTop - EYE * hv;
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

  function render(cam) {
    frustum(cam);
    renderer.render(scene, camera);
  }

  return { renderer, canvas, camera, bookMesh, setBook, booksChanged, setState, setAttr, setTextures, setShelves, setColors, resize, render, frustum };
}
