import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD, CAB, DRAWER, FOV, SPREAD, LEAN, PULL,
  arrange, pileBase, spreadPoses, drawerOut, drawerCards, focusPile, focusDrawer, matches,
} from 'shares3d/layout.js';

const project = (cam, aspect, pt) => {
  const sub = (u, v) => u.map((x, k) => x - v[k]);
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const unit = (u) => u.map((x) => x / Math.hypot(...u));
  const fwd = unit(sub(cam.look, cam.pos));
  const right = unit(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const d = sub(pt, cam.pos);
  const t = Math.tan((FOV / 2) * Math.PI / 180);
  const depth = dot(d, fwd);
  return [dot(d, right) / depth / (t * aspect), dot(d, up) / depth / t];
};
const inView = (cam, aspect, pts) => pts.every((pt) => {
  const [x, y] = project(cam, aspect, pt);
  return Math.abs(x) <= 1 && Math.abs(y) <= 1;
});
const corners = (p) => [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [p.x + sx * CARD.W / 2, p.y, p.z + sz * CARD.H / 2]));

test('攤開的一疊:桌機一排 4 張、手機 2 張,浮在桌上、在那一疊前面、互不重疊', () => {
  const wide = arrange(12, 12, 13, false);
  const base = pileBase(3, wide);
  const out = spreadPoses(6, base, wide);
  assert.equal(out.length, 6);
  assert.ok(out.every((p) => p.y >= SPREAD.Y && p.z > base.z));
  assert.equal(new Set(out.slice(0, 4).map((p) => p.z)).size, 1);
  assert.ok(out[4].z > out[0].z);
  for (let k = 1; k < 4; k++) assert.ok(out[k].x - out[k - 1].x >= CARD.W + 8);
  assert.ok(out[4].z - out[0].z >= CARD.H + 8);
  const narrow = arrange(12, 12, 13, true);
  const two = spreadPoses(5, pileBase(1, narrow), narrow);
  assert.deepEqual(two.map((p) => Math.round((p.z - two[0].z) / SPREAD.PITCH_Z)), [0, 0, 1, 1, 2]);
  assert.deepEqual(spreadPoses(0, base, wide), []);
});

test('攤開時鏡頭看得到每一張', () => {
  for (const [narrow, aspect] of [[false, 1.6], [false, 1.33], [true, 0.46]]) {
    const a = arrange(12, 12, 13, narrow);
    for (const pi of [0, 3, 11]) {
      const poses = spreadPoses(9, pileBase(pi, a), a);
      assert.ok(inView(focusPile(poses, aspect, a), aspect, poses.flatMap(corners)), `narrow=${narrow} pi=${pi}`);
    }
  }
});

test('抽屜裡的卡:往前倒的不穿過前板,後靠的不穿過背板,彼此平行不互穿', () => {
  for (const n of [1, 2, 30, 60]) {
    for (const cur of [0, Math.floor(n / 2), n - 1]) {
      const out = drawerCards(n, cur);
      assert.equal(out.length, n);
      out.forEach((c, k) => {
        assert.equal(c.rx, k < cur ? LEAN.FORWARD : LEAN.BACK);
        const top = c.z + Math.sin(c.rx) * (CARD.H / 2);
        const bottom = c.z - Math.sin(c.rx) * (CARD.H / 2);
        assert.ok(Math.max(top, bottom) <= -1, `n=${n} cur=${cur} k=${k} front`);
        assert.ok(Math.min(top, bottom) >= -(CAB.DEPTH - 20), `n=${n} cur=${cur} k=${k} back`);
        assert.ok(c.y + Math.cos(c.rx) * (CARD.H / 2) <= DRAWER.H / 2 + CARD.H, 'top stays near the drawer');
      });
      for (let k = 1; k < n; k++) {
        if (out[k].rx !== out[k - 1].rx) continue;
        const dz = out[k - 1].z - out[k].z;
        assert.ok(dz * Math.cos(out[k].rx) > CARD.T, `n=${n} cur=${cur} k=${k} parallel gap`);
      }
    }
  }
});

test('撥到第幾張,前面的都倒下', () => {
  const out = drawerCards(5, 3);
  assert.deepEqual(out.map((c) => c.rx > 0), [true, true, true, false, false]);
});

test('拉開的抽屜往前拉,鏡頭看得到整個抽屜', () => {
  for (const [narrow, aspect] of [[false, 1.6], [true, 0.46]]) {
    const a = arrange(12, 12, 13, narrow);
    for (const k of [0, 6, 12]) {
      const out = drawerOut(a.cab, k);
      assert.equal(out.z, a.cab.z + PULL);
      const pts = [-1, 1].flatMap((sx) => [out.z + DRAWER.D, out.z - CAB.DEPTH + 40].map((z) => [out.x + sx * DRAWER.W / 2, out.y, z]));
      assert.ok(inView(focusDrawer(out, aspect, a), aspect, pts), `narrow=${narrow} k=${k}`);
    }
  }
});

test('搜尋:不分大小寫、每個詞都要有,空字串全中', () => {
  const it = { t: 'AI Agent Identity', s: 'cruxdigits.nl', n: null, e: 'OAuth drafts expired', g: ['Security'] };
  assert.equal(matches(it, ''), true);
  assert.equal(matches(it, '  '), true);
  assert.equal(matches(it, 'agent oauth'), true);
  assert.equal(matches(it, 'AGENT'), true);
  assert.equal(matches(it, 'security'), true);
  assert.equal(matches(it, 'agent kubernetes'), false);
  assert.equal(matches({ t: '目錄櫃', s: 'a.com', g: [] }, '櫃'), true);
});
