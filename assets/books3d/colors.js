const TOKENS = ['desk', 'shelf', 'paper', 'paper-deep', 'edge', 'edge-n', 'drop-near'];

let ctx = null;

function probe() {
  if (!ctx) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    ctx = c.getContext('2d', { willReadFrequently: true });
  }
  return ctx;
}

export function rgba(css) {
  const g = probe();
  g.clearRect(0, 0, 1, 1);
  g.fillStyle = '#000';
  g.fillStyle = css;
  g.fillRect(0, 0, 1, 1);
  const d = g.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
}

export function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  TOKENS.forEach((name) => { out[name] = rgba(cs.getPropertyValue('--' + name).trim() || '#808080'); });
  return out;
}

export function hexRgb(hex) {
  const h = (hex || '#888888').replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function watchTheme(cb) {
  new MutationObserver(cb).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', cb);
}
