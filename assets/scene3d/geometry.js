import * as THREE from 'three';

export function box(x0, x1, y0, y1, z0, z1) {
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
