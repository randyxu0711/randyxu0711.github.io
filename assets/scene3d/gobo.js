import * as THREE from 'three';

const S = 1024;
const _p = new THREE.Vector3();

export function createGobo() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const texture = new THREE.CanvasTexture(canvas);

  function draw(light, win) {
    light.shadow.updateMatrices(light);
    const cam = light.shadow.camera;
    const at = (z, y) => {
      _p.set(win.x, y, z).project(cam);
      return [((_p.x + 1) / 2) * S, (1 - (_p.y + 1) / 2) * S];
    };
    const g = canvas.getContext('2d');
    g.filter = 'none';
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    g.filter = `blur(${win.soft}px)`;
    const quad = (z0, y0, z1, y1, style) => {
      g.fillStyle = style;
      g.beginPath();
      [at(z0, y0), at(z1, y0), at(z1, y1), at(z0, y1)].forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fill();
    };
    quad(win.z0, win.y0, win.z1, win.y1, '#fff');
    const b = win.bar / 2;
    for (let i = 1; i < win.cols; i++) {
      const z = win.z0 + ((win.z1 - win.z0) * i) / win.cols;
      quad(z - b, win.y0, z + b, win.y1, '#000');
    }
    for (let j = 1; j < win.rows; j++) {
      const y = win.y0 + ((win.y1 - win.y0) * j) / win.rows;
      quad(win.z0, y - b, win.z1, y + b, '#000');
    }
    texture.needsUpdate = true;
  }

  return { texture, draw };
}
