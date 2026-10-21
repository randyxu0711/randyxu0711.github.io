import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classOf, decode, unwrap, area, dirOf, lonLatOfUv, toPixel, distAt, zoomAt, spread, focusDist, cull, ranking, nearestAngle, contains, SMALL } from 'books3d/geo.js';

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
  try { topo = JSON.parse(readFileSync(new URL('../../assets/vendor/world-atlas/countries-110m.json', import.meta.url))); } catch (e) { return t.skip('world-atlas not vendored'); }
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
