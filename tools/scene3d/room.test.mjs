import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM, SUN, toView, sunDir, lampDir } from 'scene3d/room.js';

const VIEWS = ['desk', 'books', 'globe'];

test('desk: sun from the left and slightly behind', () => {
  const [x, y, z] = sunDir('desk');
  assert.ok(x < -0.5 && y > 0.3 && z > 0.1);
});

test('books: sun from behind, slightly left', () => {
  const [x, y, z] = sunDir('books');
  assert.ok(z > 0.5 && x < 0 && y > 0.15);
});

test('globe: sun from the right and behind', () => {
  const [x, , z] = sunDir('globe');
  assert.ok(x > 0.5 && z > 0);
});

test('desk lamp is front-left of the desk', () => {
  const [x, y, z] = lampDir('desk');
  assert.ok(x < 0 && y > 0 && z < 0);
});

test('books floor lamp is on the right', () => {
  assert.ok(lampDir('books')[0] > 0.3);
});

test('globe floor lamp is on the left', () => {
  assert.ok(lampDir('globe')[0] < -0.3);
});

test('directions are unit vectors', () => {
  for (const v of VIEWS) for (const d of [sunDir(v), lampDir(v)]) assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9);
});

test('toView keeps the vertical axis', () => {
  for (const v of VIEWS) assert.deepEqual(toView(v, [0, 1, 0]).map((k) => Math.round(k * 1e9) / 1e9 + 0), [0, 1, 0]);
});

test('sun comes from the west, 30 degrees up', () => {
  assert.ok(SUN[0] < 0);
  assert.ok(Math.abs(Math.asin(SUN[1]) - Math.PI / 6) < 1e-9);
});

test('furniture sits inside the room', () => {
  for (const p of [ROOM.DESK_LAMP, ROOM.FLOOR_LAMP, ROOM.BOOKCASE, ROOM.GLOBE]) {
    assert.ok(p[0] >= 0 && p[0] <= ROOM.W && p[2] >= 0 && p[2] <= ROOM.D);
  }
});

test('window is on the west wall beside the desk', () => {
  assert.ok(ROOM.WINDOW.z0 < ROOM.DESK.z0 + ROOM.DESK.d + 400 && ROOM.WINDOW.z1 > ROOM.DESK.z0 + ROOM.DESK.d);
  assert.ok(ROOM.WINDOW.sill > ROOM.DESK.top);
});
