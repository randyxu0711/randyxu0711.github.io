export const STEPS = [1, 2, 5, 10, 20];
export const SMALL = 0.001;
export const FOCUS = 0.4;

export const classOf = (n) => STEPS.filter((s) => n >= s).length - 1;

export function decode(topo, object = 'countries') {
  const tf = topo.transform;
  const arcs = topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return tf ? [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]] : [dx, dy];
    });
  });
  const ring = (ids) => {
    const out = [];
    ids.forEach((id) => {
      const pts = id < 0 ? arcs[~id].slice().reverse() : arcs[id];
      pts.forEach((p, k) => { if (k || !out.length) out.push(p); });
    });
    return unwrap(out);
  };
  const out = new Map();
  topo.objects[object].geometries.forEach((g) => {
    const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    if (!polys.length || !g.properties) return;
    out.set(g.properties.name, polys.map((p) => p.map(ring)));
  });
  return out;
}

export function unwrap(ring) {
  const out = [];
  let shift = 0;
  ring.forEach(([lon, lat], k) => {
    if (k) {
      const prev = out[k - 1][0];
      while (lon + shift - prev > 180) shift -= 360;
      while (lon + shift - prev < -180) shift += 360;
    }
    out.push([lon + shift, lat]);
  });
  const first = out[0];
  const last = out[out.length - 1];
  if (Math.abs(last[0] - first[0]) > 180) {
    const pole = out.reduce((s, p) => s + p[1], 0) < 0 ? -90 : 90;
    out.push([last[0], pole], [first[0], pole], first);
  }
  return out;
}

const RAD = Math.PI / 180;

function ringArea(ring) {
  let s = 0;
  for (let k = 0; k < ring.length - 1; k++) {
    const [l1, p1] = ring[k];
    const [l2, p2] = ring[k + 1];
    s += (l2 - l1) * RAD * (2 + Math.sin(p1 * RAD) + Math.sin(p2 * RAD));
  }
  return Math.abs(s / 2);
}

export function area(polys) {
  return polys.reduce((sum, rings) => sum + rings.reduce((a, r, k) => a + (k ? -1 : 1) * ringArea(r), 0), 0);
}

export function dirOf(lon, lat) {
  const phi = (lon + 180) * RAD;
  const th = (90 - lat) * RAD;
  return [-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th)];
}

export const lonLatOfUv = (u, v) => [u * 360 - 180, v * 180 - 90];

export const toPixel = (lon, lat, w, h) => [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];

export function distAt(z, R, near, far) {
  return R + (far - R) * Math.pow((near - R) / (far - R), z);
}

export function zoomAt(d, R, near, far) {
  return Math.log((Math.min(far, Math.max(near, d)) - R) / (far - R)) / Math.log((near - R) / (far - R));
}

export function spread(polys, at) {
  const main = polys.reduce((best, p) => (area([p]) > area([best]) ? p : best));
  const c = dirOf(at[0], at[1]);
  return main[0].reduce((m, [lon, lat]) => {
    const v = dirOf(lon, lat);
    return Math.max(m, Math.acos(Math.min(1, c[0] * v[0] + c[1] * v[1] + c[2] * v[2])));
  }, 0);
}

export function focusDist(s, tanV, aspect, frac = FOCUS) {
  return 1 + Math.sin(Math.min(s, Math.PI / 2)) / (frac * tanV * Math.min(1, aspect));
}

export function cull(labels, pad = [3, 2]) {
  const placed = [];
  return labels
    .slice()
    .sort((a, b) => b.score - a.score)
    .filter((l) => {
      const box = [l.x - l.w / 2 - pad[0], l.y - l.h / 2 - pad[1], l.x + l.w / 2 + pad[0], l.y + l.h / 2 + pad[1]];
      if (box[2] < 0 || box[3] < 0 || box[0] > l.vw || box[1] > l.vh) return false;
      if (placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) return false;
      placed.push(box);
      return true;
    });
}

export function ranking(books, name = (k) => k) {
  const counts = new Map();
  books.forEach((b) => { if (b.g) counts.set(b.g, (counts.get(b.g) || 0) + 1); });
  return [...counts]
    .map(([country, count]) => ({ country, count, cls: classOf(count) }))
    .sort((a, b) => b.count - a.count || name(a.country).localeCompare(name(b.country)));
}

export function nearestAngle(from, to) {
  const d = ((((to - from) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return from + d;
}

function inRing(ring, x, y) {
  let inside = false;
  for (let k = 0, j = ring.length - 1; k < ring.length; j = k++) {
    const [xi, yi] = ring[k];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function contains(polys, lon, lat) {
  return [lon, lon - 360, lon + 360].some((x) => polys.some((rings) => inRing(rings[0], x, lat) && !rings.slice(1).some((h) => inRing(h, x, lat))));
}
