import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ShapeUtils, Vector2 } from 'three';
import { globeSpot, reach, classOf, decode, decodeArcs, tessellate, strokes, graticule, unwrap, area, dirOf, lonLatOf, bounds, inBounds, thin, lonLatOfUv, toPixel, distAt, zoomAt, spread, focusDist, cull, ranking, nearestAngle, contains, pinSpots, SMALL } from 'books3d/geo.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' ≉ ' + b);

test('classes are 1 / 2–4 / 5–9 / 10–19 / 20+', () => {
  assert.deepEqual([1, 2, 4, 5, 9, 10, 19, 20, 63].map(classOf), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test('decode follows delta-encoded arcs, reversed arcs and the transform', () => {
  const topo = {
    type: 'Topology',
    transform: { scale: [1, 2], translate: [10, 20] },
    arcs: [[[0, 0], [1, 0], [0, 1]], [[1, 1], [-1, 0], [0, -1]]],
    objects: { countries: { type: 'GeometryCollection', geometries: [
      { type: 'Polygon', arcs: [[0, 1]], properties: { name: 'A' } },
      { type: 'MultiPolygon', arcs: [[[~1, ~0]]], properties: { name: 'B' } },
      { type: 'Polygon', arcs: [[0]] },
    ] } },
  };
  const m = decode(topo);
  assert.deepEqual([...m.keys()], ['A', 'B']);
  assert.deepEqual(m.get('A'), [[[[10, 20], [11, 20], [11, 22], [10, 22], [10, 20]]]]);
  assert.deepEqual(m.get('B')[0][0], [[10, 20], [10, 22], [11, 22], [11, 20], [10, 20]]);
});

test('area of a lon/lat box matches the spherical formula and subtracts holes', () => {
  const box = (l0, p0, l1, p1) => [[l0, p0], [l1, p0], [l1, p1], [l0, p1], [l0, p0]];
  const exact = (dl, p0, p1) => dl * Math.PI / 180 * (Math.sin(p1 * Math.PI / 180) - Math.sin(p0 * Math.PI / 180));
  near(area([[box(0, 0, 10, 10)]]), exact(10, 0, 10), 1e-3);
  near(area([[box(0, 0, 10, 10), box(2, 2, 4, 4)]]), exact(10, 0, 10) - exact(2, 2, 4), 1e-3);
  near(area([[box(0, 0, 10, 10)], [box(20, 0, 30, 10)]]), 2 * exact(10, 0, 10), 1e-3);
});

test('directions match three.js SphereGeometry uv mapping', () => {
  const d = dirOf(-180, 0);
  near(d[0], -1);
  near(d[1], 0);
  near(dirOf(0, 90)[1], 1);
  const [lon, lat] = lonLatOfUv(0.75, 0.5 + 30 / 180);
  near(lon, 90);
  near(lat, 30);
  assert.deepEqual(toPixel(0, 0, 4096, 2048), [2048, 1024]);
});

test('zoom curve runs from far to near and zoomAt inverts it', () => {
  near(distAt(0, 1, 1.55, 6), 6);
  near(distAt(1, 1, 1.55, 6), 1.55);
  near(distAt(zoomAt(3, 1, 1.55, 6), 1, 1.55, 6), 3);
  near(zoomAt(100, 1, 1.55, 6), 0);
  near(zoomAt(1.1, 1, 1.55, 6), 1);
});

test('spread is the angular radius of the largest polygon around the anchor', () => {
  const box = (l0, p0, l1, p1) => [[l0, p0], [l1, p0], [l1, p1], [l0, p1], [l0, p0]];
  const polys = [[box(-1, -1, 1, 1)], [box(50, 0, 51, 1)]];
  near(spread(polys, [0, 0]), Math.acos(Math.cos(Math.PI / 180) ** 2), 1e-9);
});

test('focus distance frames the country at FOCUS of the short side', () => {
  const tanV = Math.tan(Math.PI / 12);
  const d = focusDist(0.1, tanV, 16 / 9);
  near(Math.sin(0.1) / ((d - 1) * tanV), 0.4);
  assert.ok(focusDist(0.1, tanV, 0.46) > d);
});

test('labels are placed by score and overlapping ones are dropped', () => {
  const L = (id, x, y, score) => ({ id, x, y, w: 40, h: 14, score, vw: 500, vh: 300 });
  const out = cull([L('low', 110, 100, 1), L('high', 100, 100, 9), L('far', 300, 100, 2), L('off', -100, 100, 99)]);
  assert.deepEqual(out.map((l) => l.id), ['high', 'far']);
});

test('ranking counts countries, ignores unplaced books, ties by name', () => {
  const books = [{ g: 'B' }, { g: 'A' }, { g: 'C' }, { g: 'C' }, { g: null }];
  assert.deepEqual(ranking(books).map((r) => [r.country, r.count, r.cls]), [['C', 2, 1], ['A', 1, 0], ['B', 1, 0]]);
});

test('nearestAngle picks the short way round', () => {
  near(nearestAngle(0.1, 2 * Math.PI - 0.1), -0.1);
  near(nearestAngle(3, -3), 2 * Math.PI - 3);
});

test('real world-atlas: small-country threshold splits Jamaica from Japan', (t) => {
  let topo;
  try { topo = JSON.parse(readFileSync(new URL('../../assets/vendor/world-atlas/countries-50m.json', import.meta.url))); } catch (e) { return t.skip('world-atlas not vendored'); }
  const m = decode(topo);
  assert.ok(area(m.get('Jamaica')) < SMALL);
  assert.ok(area(m.get('Japan')) > SMALL);
  assert.ok(area(m.get('Czechia')) > SMALL);
  near(area(m.get('Russia')), 17.1e6 / 40.6e6, 0.02);
  near(area(m.get('Fiji')), 18.3e3 / 40.6e6, 2e-4);
});

test('rings crossing the antimeridian are unwrapped; rings around a pole are closed through it', () => {
  assert.deepEqual(unwrap([[179, 0], [-179, 1], [179, 2]]), [[179, 0], [181, 1], [179, 2]]);
  const r = unwrap([[-180, -80], [-60, -78], [60, -79], [180, -80]]);
  assert.deepEqual(r.slice(-3), [[180, -90], [-180, -90], [-180, -80]]);
});

test('contains handles holes and longitudes past the antimeridian', () => {
  const box = (l0, p0, l1, p1) => [[l0, p0], [l1, p0], [l1, p1], [l0, p1], [l0, p0]];
  const polys = [[box(170, 0, 190, 10), box(175, 2, 178, 4)]];
  assert.ok(contains(polys, 172, 5));
  assert.ok(contains(polys, -175, 5));
  assert.ok(!contains(polys, 176, 3));
  assert.ok(!contains(polys, 160, 5));
});

test('pin spots fall inside the country, keep apart and are deterministic', () => {
  const L = [[[0, 0], [20, 0], [20, 4], [0, 4], [0, 0]]];
  const polys = [L, [[[50, 50], [50.1, 50], [50.1, 50.1], [50, 50]]]];
  const a = pinSpots(polys, 30);
  assert.equal(a.length, 30);
  assert.ok(a.every(([x, y]) => x > 0 && x < 20 && y > 0 && y < 4));
  const min = Math.min(...a.flatMap((p, i) => a.slice(i + 1).map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))));
  assert.ok(min > 1.5, 'min gap ' + min);
  assert.deepEqual(pinSpots(polys, 30), a);
  assert.deepEqual(pinSpots(polys, 0), []);
});

test('globeSpot puts the globe straight to the right, past the screen, so the turn walks forward', () => {
  for (const [vw, vh] of [[1280, 800], [1920, 1080], [390, 844]]) {
    const span = 1000;
    const { R, x, corner } = globeSpot(span, vw, vh);
    assert.ok(x - reach(vw / vh) * R > 0, 'walks forward after turning');
    assert.ok(corner > span / 2, 'corner is off screen');
    near(corner, x + 1.2 * R);
  }
  assert.ok(globeSpot(1000, 390, 844).R > globeSpot(1000, 1280, 800).R);
});

const earcut = (c, h) => ShapeUtils.triangulateShape(c.map(([x, y]) => new Vector2(x, y)), h.map((r) => r.map(([x, y]) => new Vector2(x, y))));
const shoelace = (r) => r.reduce((s, p, k) => { const q = r[(k + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

test('tessellate covers the polygon minus its hole, every triangle counter-clockwise and no edge over the limit', () => {
  const outer = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
  const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  const f = tessellate([[outer, hole]], 3, earcut);
  let sum = 0;
  for (let i = 0; i < f.length; i += 6) {
    const a = shoelace([[f[i], f[i + 1]], [f[i + 2], f[i + 3]], [f[i + 4], f[i + 5]]]);
    assert.ok(a > 0);
    sum += a;
    [[0, 2], [2, 4], [4, 0]].forEach(([p, q]) => assert.ok(Math.hypot(f[i + p] - f[i + q], f[i + p + 1] - f[i + q + 1]) <= 3 + 1e-9));
  }
  near(sum, 100 - 4, 1e-6);
});

test('tessellate leaves no T-junctions: no vertex sits inside another triangle\'s edge', () => {
  const ring = [[0, 0], [20, 0], [20, 3], [9, 3], [9, 14], [0, 14], [0, 0]];
  const f = tessellate([[ring]], 2.5, earcut);
  const pts = [];
  const edges = [];
  for (let i = 0; i < f.length; i += 6) {
    const t = [[f[i], f[i + 1]], [f[i + 2], f[i + 3]], [f[i + 4], f[i + 5]]];
    pts.push(...t);
    edges.push([t[0], t[1]], [t[1], t[2]], [t[2], t[0]]);
  }
  for (const [a, b] of edges) {
    for (const p of pts) {
      const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      const dot = (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
      const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
      const inside = Math.abs(cross) < 1e-9 && dot > 1e-9 && dot < len2 - 1e-9;
      assert.ok(!inside, 'T-junction at ' + p + ' on ' + a + '→' + b);
    }
  }
});

test('strokes: two vertices per point, sides tangent to the sphere, quads face outward', () => {
  const { pos, side, s, index } = strokes([[[0, 0], [10, 0]]], 1.5, 4);
  assert.equal(pos.length / 3, 2 * 4);
  assert.equal(index.length, 6 * 3);
  for (let v = 0; v < pos.length / 3; v++) {
    const p = pos.subarray(v * 3, v * 3 + 3);
    const d = side.subarray(v * 3, v * 3 + 3);
    near(Math.hypot(...p), 1.5, 1e-6);
    near(Math.hypot(...d), 1, 1e-6);
    near(p[0] * d[0] + p[1] * d[1] + p[2] * d[2], 0, 1e-6);
  }
  assert.deepEqual([...s.slice(0, 4)], [-1, 1, -1, 1]);
  const at = (i, k) => [0, 1, 2].map((j) => pos[i * 3 + j] + side[i * 3 + j] * s[i] * k);
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((j) => at(index[t + j], 0.01));
    const u = a.map((x, j) => b[j] - x);
    const w = a.map((x, j) => c[j] - x);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    assert.ok(n[0] * a[0] + n[1] * a[1] + n[2] * a[2] > 0);
  }
});

test('strokes skip the cut along the antimeridian only when asked', () => {
  const line = [[[170, 60], [180, 60], [180, 70], [170, 70]]];
  assert.equal(strokes(line, 1, 20, true).index.length, 6 * 2);
  assert.equal(strokes(line, 1, 20).index.length, 6 * 3);
});

test('strokes cross the antimeridian the short way, not around the globe', () => {
  const { pos } = strokes([[[179.5, -17], [-179.5, -17]]], 1, 0.25);
  assert.equal(pos.length / 3, 2 * 5);
  for (let v = 2; v < pos.length / 3; v += 2) {
    const d = Math.hypot(pos[v * 3] - pos[v * 3 - 6], pos[v * 3 + 1] - pos[v * 3 - 5], pos[v * 3 + 2] - pos[v * 3 - 4]);
    assert.ok(d < 0.01, 'jump ' + d);
  }
});

test('graticule: meridians every step, parallels without the poles, all of them drawn', () => {
  const g = graticule(15);
  assert.equal(g.length, 24 + 11);
  g.forEach((line) => assert.ok(strokes([line], 1, 1).index.length > 0));
});

test('real world-atlas 50m: arcs decode to lon/lat, the world tessellates', (t) => {
  let topo;
  try { topo = JSON.parse(readFileSync(new URL('../../assets/vendor/world-atlas/countries-50m.json', import.meta.url))); } catch (e) { return t.skip('world-atlas not vendored'); }
  const arcs = decodeArcs(topo);
  assert.ok(arcs.flat().every(([lon, lat]) => Math.abs(lon) <= 180 + 1e-6 && Math.abs(lat) <= 90 + 1e-6));
  const tw = decode(topo).get('Taiwan');
  const f = tessellate(tw, 4, earcut);
  let sum = 0;
  for (let i = 0; i < f.length; i += 6) sum += shoelace([[f[i], f[i + 1]], [f[i + 2], f[i + 3]], [f[i + 4], f[i + 5]]]);
  near(sum, tw.reduce((a, rings) => a + Math.abs(shoelace(rings[0].slice(0, -1))), 0), 1e-6);
});

test('lonLatOf inverts dirOf', () => {
  for (const [lon, lat] of [[0, 0], [121, 23.5], [-179.5, -17], [179.5, 64], [-35, 38], [90, -60]]) {
    const [a, b] = lonLatOf(dirOf(lon, lat));
    near(a, lon, 1e-9);
    near(b, lat, 1e-9);
  }
});

test('bounds and inBounds wrap across the antimeridian', () => {
  const b = bounds([[[[170, 10], [190, 10], [190, 20], [170, 20], [170, 10]]]]);
  assert.deepEqual(b, [170, 190, 10, 20]);
  assert.ok(inBounds(b, -175, 15));
  assert.ok(inBounds(b, 175, 15));
  assert.ok(!inBounds(b, 175, 25));
  assert.ok(!inBounds(b, 0, 15));
});

test('thin keeps ring ends, drops close points, drops rings and polygons that get too small', () => {
  const ring = [[0, 0], [0.01, 0], [0.02, 0], [5, 0], [5, 5], [0, 5], [0, 0]];
  const tiny = [[1, 1], [1.01, 1], [1.01, 1.01], [1, 1]];
  const out = thin([[ring, tiny], [tiny]], 0.5);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]]);
});
