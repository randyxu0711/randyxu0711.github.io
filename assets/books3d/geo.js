export const STEPS = [1, 2, 5, 10, 20];
export const SMALL = 0.001;
export const FOCUS = 0.4;
export const FOV = 30;
export const RING = 1.07;

export const classOf = (n) => STEPS.filter((s) => n >= s).length - 1;

export function decodeArcs(topo) {
  const tf = topo.transform;
  return topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return tf ? [x * tf.scale[0] + tf.translate[0], y * tf.scale[1] + tf.translate[1]] : [dx, dy];
    });
  });
}

export function decode(topo, object = 'countries') {
  const arcs = decodeArcs(topo);
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
const TAN = Math.tan((FOV / 2) * RAD);

export function reach(aspect) {
  return Math.max((RING + 0.5) / 0.82 / TAN, 1.25 / 0.94 / (TAN * aspect));
}

export function globeSpot(span, vw, vh) {
  const R = span / (vw <= 640 ? 3.5 : 7.2);
  const x = reach(vw / vh) * R + span * 0.3;
  return { R, x, corner: x + 1.2 * R };
}

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

export function lonLatOf([x, y, z]) {
  const lon = (Math.atan2(z, -x) * 180) / Math.PI - 180;
  return [lon < -180 ? lon + 360 : lon, (Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI];
}

export function bounds(polys) {
  const b = [Infinity, -Infinity, Infinity, -Infinity];
  polys.forEach((rings) => rings[0].forEach(([lon, lat]) => {
    b[0] = Math.min(b[0], lon);
    b[1] = Math.max(b[1], lon);
    b[2] = Math.min(b[2], lat);
    b[3] = Math.max(b[3], lat);
  }));
  return b;
}

export function inBounds(b, lon, lat) {
  return lat >= b[2] && lat <= b[3] && [lon, lon - 360, lon + 360].some((x) => x >= b[0] && x <= b[1]);
}

export function thin(polys, minDeg) {
  const keep = (r) => {
    const out = [r[0]];
    for (let k = 1; k < r.length - 1; k++) {
      const q = out[out.length - 1];
      if (Math.abs(r[k][0] - q[0]) + Math.abs(r[k][1] - q[1]) >= minDeg) out.push(r[k]);
    }
    out.push(r[r.length - 1]);
    return out;
  };
  return polys.map((rings) => rings.map(keep)).filter((rings) => rings[0].length > 3).map((rings) => [rings[0], ...rings.slice(1).filter((r) => r.length > 3)]);
}

export const lonLatOfUv = (u, v) => [u * 360 - 180, v * 180 - 90];

export const toPixel = (lon, lat, w, h) => [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];

export function distAt(z, R, near, far) {
  return R + (far - R) * Math.pow((near - R) / (far - R), z);
}

export function zoomAt(d, R, near, far) {
  return Math.log((Math.min(far, Math.max(near, d)) - R) / (far - R)) / Math.log((near - R) / (far - R));
}

function largest(polys) {
  const areas = polys.map((p) => area([p]));
  return polys[areas.indexOf(Math.max(...areas))];
}

export function spread(polys, at) {
  const main = largest(polys);
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

function halton(i, b) {
  let f = 1;
  let r = 0;
  for (let k = i; k > 0; k = Math.floor(k / b)) {
    f /= b;
    r += f * (k % b);
  }
  return r;
}

export function pinSpots(polys, n) {
  if (!n) return [];
  const main = largest(polys);
  const ring = main[0];
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const cosMid = Math.cos(((y0 + y1) / 2) * RAD);
  const coarse = thin([main], 0.2)[0] || main;
  const within = (rings, x, y) => inRing(rings[0], x, y) && !rings.slice(1).some((h) => inRing(h, x, y));
  const inside = [];
  for (let i = 1; inside.length < 1500 && i < 15000; i++) {
    const p = [x0 + halton(i, 2) * (x1 - x0), y0 + halton(i, 3) * (y1 - y0)];
    if (within(coarse, p[0], p[1]) && within(main, p[0], p[1])) inside.push(p);
  }
  if (!inside.length) return Array.from({ length: n }, () => [(x0 + x1) / 2, (y0 + y1) / 2]);
  const gap = (a, b) => Math.hypot((a[0] - b[0]) * cosMid, a[1] - b[1]);
  const far = inside.map(() => Infinity);
  const out = [];
  let next = 0;
  while (out.length < n) {
    const q = inside[next];
    out.push(q);
    let bd = -1;
    inside.forEach((p, i) => {
      far[i] = Math.min(far[i], gap(p, q));
      if (far[i] > bd) { bd = far[i]; next = i; }
    });
  }
  return out;
}

export function tessellate(polys, maxDeg, triangulate) {
  const out = [];
  const long = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > maxDeg;
  const m = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const split = (a, b, c) => {
    const cut = [long(a, b), long(b, c), long(c, a)];
    const n = cut.filter(Boolean).length;
    if (!n) return void out.push(a[0], a[1], b[0], b[1], c[0], c[1]);
    if (n === 3) {
      const [x, y, z] = [m(a, b), m(b, c), m(c, a)];
      split(a, x, z);
      split(x, b, y);
      split(z, y, c);
      split(x, y, z);
      return;
    }
    const k = n === 1 ? cut.indexOf(true) : cut.indexOf(false) === 2 ? 0 : cut.indexOf(false) === 0 ? 1 : 2;
    const [p, q, r] = [[a, b, c], [b, c, a], [c, a, b]][k];
    const x = m(p, q);
    if (n === 1) {
      split(p, x, r);
      split(x, q, r);
      return;
    }
    const y = m(q, r);
    split(x, q, y);
    split(p, x, y);
    split(p, y, r);
  };
  const strip = (r) => {
    const last = r[r.length - 1];
    return r.length > 1 && last[0] === r[0][0] && last[1] === r[0][1] ? r.slice(0, -1) : r.slice();
  };
  polys.forEach((rings) => {
    const rs = rings.map(strip);
    const all = rs.flat();
    triangulate(rs[0], rs.slice(1)).forEach(([i, j, k]) => {
      const [a, b, c] = [all[i], all[j], all[k]];
      if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) split(a, c, b);
      else split(a, b, c);
    });
  });
  return out;
}

export function graticule(step) {
  const lines = [];
  for (let lon = -180; lon < 180; lon += step) lines.push([[lon, -90], [lon, 90]]);
  for (let lat = -90 + step; lat < 90; lat += step) lines.push([[-180, lat], [0, lat], [180, lat]]);
  return lines;
}

const seam = (a, b) => Math.abs(a[0]) > 179.99 && Math.abs(b[0]) > 179.99;

export function strokes(lines, r, maxDeg, cut = false) {
  const pos = [];
  const side = [];
  const s = [];
  const index = [];
  lines.forEach((line) => {
    const pts = [];
    const flush = () => {
      const n = pts.length;
      if (n < 2) return void (pts.length = 0);
      const base = pos.length / 3;
      const d = pts.map(([lon, lat]) => dirOf(lon, lat));
      d.forEach((p, i) => {
        const a = d[Math.max(0, i - 1)];
        const b = d[Math.min(n - 1, i + 1)];
        const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const c = [t[1] * p[2] - t[2] * p[1], t[2] * p[0] - t[0] * p[2], t[0] * p[1] - t[1] * p[0]];
        const l = Math.hypot(c[0], c[1], c[2]) || 1;
        for (const k of [-1, 1]) {
          pos.push(p[0] * r, p[1] * r, p[2] * r);
          side.push(c[0] / l, c[1] / l, c[2] / l);
          s.push(k);
        }
        if (i) {
          const L0 = base + (i - 1) * 2;
          index.push(L0, L0 + 1, L0 + 3, L0, L0 + 3, L0 + 2);
        }
      });
      pts.length = 0;
    };
    let shift = 0;
    line.forEach((raw, i) => {
      if (!i) return void pts.push(raw);
      const prev = line[i - 1];
      if (cut && seam(prev, raw)) {
        flush();
        shift = 0;
        pts.push(raw);
        return;
      }
      const p = pts[pts.length - 1];
      while (raw[0] + shift - p[0] > 180) shift -= 360;
      while (raw[0] + shift - p[0] < -180) shift += 360;
      const q = [raw[0] + shift, raw[1]];
      const steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / maxDeg));
      for (let k = 1; k <= steps; k++) pts.push([p[0] + ((q[0] - p[0]) * k) / steps, p[1] + ((q[1] - p[1]) * k) / steps]);
    });
    flush();
  });
  return { pos: new Float32Array(pos), side: new Float32Array(side), s: new Float32Array(s), index: new Uint32Array(index) };
}
