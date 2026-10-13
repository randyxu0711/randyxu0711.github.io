import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD, DESK, PILES, CAB, DRAWER, SPLIT, FOV,
  taipeiToday, weekStart, pickDesk, groups, cabinet, arrange, deskPose, pilePose, pileBase, pileLabelPose, cameraAt, mainName, hueOf, tabSlot,
} from 'shares3d/layout.js';

const share = (d, extra = {}) => ({ d, s: 'example.com', g: [], ...extra });
const days = (from, n) => {
  const out = [];
  for (let k = 0; k < n; k++) out.push(new Date(Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10)) - k * 86400000).toISOString().slice(0, 10));
  return out;
};

test('台北日期:UTC 17:00 已經是隔天', () => {
  assert.equal(taipeiToday(Date.UTC(2026, 9, 12, 17, 0)), '2026-10-13');
  assert.equal(taipeiToday(Date.UTC(2026, 9, 12, 15, 59)), '2026-10-12');
});

test('週一開始的一週', () => {
  assert.equal(weekStart('2026-10-12'), '2026-10-12');
  assert.equal(weekStart('2026-10-18'), '2026-10-12');
  assert.equal(weekStart('2026-10-11'), '2026-10-05');
  assert.equal(weekStart('2026-01-01'), '2025-12-29');
});

test('桌上:最近 7 天(含今天)', () => {
  const items = ['2026-10-13', '2026-10-10', '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-01'].map((d) => share(d));
  const { desk, piles } = pickDesk(items, '2026-10-13');
  assert.deepEqual(desk, [0, 1, 2, 3]);
  assert.deepEqual(piles, [{ week: '2026-10-05', ids: [4] }, { week: '2026-09-28', ids: [5] }]);
});

test('桌上:7 天內不到 4 張就補最新的', () => {
  const items = ['2026-08-01', '2026-07-30', '2026-07-20', '2026-07-10', '2026-07-01'].map((d) => share(d));
  assert.deepEqual(pickDesk(items, '2026-10-13').desk, [0, 1, 2, 3]);
  assert.deepEqual(pickDesk(items.slice(0, 2), '2026-10-13').desk, [0, 1]);
});

test('桌上:最多 12 張,多的進它那一週的疊', () => {
  const items = days('2026-10-13', 7).flatMap((d) => [share(d), share(d)]);
  const { desk, piles } = pickDesk(items, '2026-10-13');
  assert.equal(desk.length, DESK.MAX);
  assert.deepEqual(piles, [{ week: '2026-10-05', ids: [12, 13] }]);
});

test('週疊:新到舊、最多 12 疊,更早的不上桌', () => {
  const items = days('2026-10-13', 7 * 20).filter((_, k) => k % 7 === 0).map((d) => share(d));
  const { desk, piles } = pickDesk(items, '2026-10-13');
  assert.equal(desk.length, DESK.MIN);
  assert.equal(piles.length, PILES.MAX);
  const weeks = piles.map((p) => p.week);
  assert.deepEqual(weeks, [...weeks].sort().reverse());
  assert.ok(piles.every((p) => p.ids.every((i) => weekStart(items[i].d) === p.week)));
});

test('分組:tag 每個 tag 一份,張數多的在前,未分類最後', () => {
  const items = [share('2026-10-13', { g: ['AI/LLM', 'Security'] }), share('2026-10-12', { g: ['AI/LLM'] }), share('2026-10-11'), share('2026-10-10', { g: ['Backend'] })];
  const out = groups(items, 'tag');
  assert.deepEqual(out.map((d) => [d.key, d.kind, d.ids]), [
    ['AI/LLM', 'tag', [0, 1]],
    ['Backend', 'tag', [3]],
    ['Security', 'tag', [0]],
    ['', 'untagged', [2]],
  ]);
  assert.ok(out.every((d) => d.part === 0 && d.parts === 1));
});

test('分組:只有 1 張的來源併成其他來源,放最後', () => {
  const items = [share('2026-10-13', { s: 'a.com' }), share('2026-10-12', { s: 'b.com' }), share('2026-10-11', { s: 'a.com' }), share('2026-10-10', { s: 'c.com' })];
  assert.deepEqual(groups(items, 'source').map((d) => [d.key, d.kind, d.ids]), [
    ['a.com', 'source', [0, 2]],
    ['', 'other', [1, 3]],
  ]);
});

test('分組:月份新到舊', () => {
  const items = [share('2026-10-13'), share('2026-09-30'), share('2026-09-01'), share('2025-12-31')];
  assert.deepEqual(groups(items, 'month').map((d) => [d.key, d.ids]), [['2026-10', [0]], ['2026-09', [1, 2]], ['2025-12', [3]]]);
});

test('分組:超過 60 張拆成兩格,依日期新到舊', () => {
  const items = Array.from({ length: SPLIT + 1 }, () => share('2026-10-01', { g: ['AI/LLM'] }));
  const out = groups(items, 'tag');
  assert.deepEqual(out.map((d) => [d.part, d.parts, d.ids.length]), [[1, 2, SPLIT], [2, 2, 1]]);
  assert.equal(out[1].ids[0], SPLIT);
});

test('櫃子:4 欄,超過 16 格 5 欄;上排在高處', () => {
  const c = cabinet(13);
  assert.deepEqual([c.cols, c.rows], [4, 4]);
  assert.equal(cabinet(17).cols, 5);
  assert.equal(cabinet(2).cols, 2);
  assert.ok(c.slots[0].y > c.slots[12].y);
  assert.ok(c.slots.every((s) => Math.abs(s.x) + DRAWER.W / 2 <= c.width / 2 - CAB.SIDE));
  assert.ok(c.slots.every((s) => s.y + DRAWER.H / 2 <= c.height - CAB.TOP && s.y - DRAWER.H / 2 >= CAB.BASE));
});

test('桌上的卡不互相重疊,也不壓到週疊', () => {
  const half = (ry) => ({ x: (CARD.W / 2) * Math.cos(ry) + (CARD.H / 2) * Math.abs(Math.sin(ry)), z: (CARD.H / 2) * Math.cos(ry) + (CARD.W / 2) * Math.abs(Math.sin(ry)) });
  for (let seed = 1; seed < 40; seed++) {
    const a = deskPose(0, seed);
    const b = deskPose(1, seed + 1);
    const c = deskPose(4, seed + 2);
    assert.ok(b.x - half(b.ry).x > a.x + half(a.ry).x);
    assert.ok(a.z - half(a.ry).z > c.z + half(c.ry).z);
    assert.deepEqual(deskPose(3, seed), deskPose(3, seed));
  }
  const back = deskPose(DESK.MAX - 1, 9);
  const label = pileLabelPose(0);
  assert.ok(back.z - half(back.ry).z - 4 > label.z + 9);
  const pile = pilePose(0, 0, 3);
  assert.ok(label.z - 9 > pile.z + half(pile.ry).z);
});

test('週疊:往上疊,最後一排離櫃子還有空間', () => {
  assert.ok(pilePose(0, 3, 7).y > pilePose(0, 2, 7).y);
  assert.ok(pileBase(PILES.MAX - 1).z - CARD.H > CAB.Z + DRAWER.D);
});

test('鏡頭:三段接得起來,捲到底對準櫃子,手機拉遠', () => {
  const a = arrange(12, 12, 13, false);
  const cab = a.cab;
  const near = cameraAt(0.4999999, 1.6, a);
  const mid = cameraAt(0.5, 1.6, a);
  near.pos.forEach((v, k) => assert.ok(Math.abs(v - mid.pos[k]) < 0.01));
  assert.deepEqual(cameraAt(0, 1.6, a).look, [0, 0, 135]);
  const end = cameraAt(1, 1.6, a);
  assert.equal(end.look[2], cab.z);
  assert.ok(end.pos[2] > cab.z);
  assert.ok(cameraAt(0, 0.5, arrange(12, 12, 13, true)).pos[1] > cameraAt(0, 1.6, a).pos[1]);
  assert.deepEqual(cameraAt(2, 1.6, a), cameraAt(1, 1.6, a));
});

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
const corners = (p) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => {
  const x = (sx * CARD.W) / 2;
  const z = (sz * CARD.H) / 2;
  return [p.x + x * Math.cos(p.ry) + z * Math.sin(p.ry), p.y, p.z - x * Math.sin(p.ry) + z * Math.cos(p.ry)];
});
const inView = (cam, aspect, pts, ylim = 0.95) => pts.every((pt) => {
  const [x, y] = project(cam, aspect, pt);
  return Math.abs(x) <= 1 && Math.abs(y) <= ylim;
});
const half = (ry) => ({ x: (CARD.W / 2) * Math.cos(ry) + (CARD.H / 2) * Math.abs(Math.sin(ry)), z: (CARD.H / 2) * Math.cos(ry) + (CARD.W / 2) * Math.abs(Math.sin(ry)) });

test('排法:桌機維持原本的數字', () => {
  const a = arrange(12, 12, 13, false);
  assert.deepEqual([a.cols, a.deskRows, a.pileCols, a.pileRows, a.front, a.pileBack, a.cab.z, a.cab.cols], [4, 3, 4, 3, 240, -90, -480, 4]);
  assert.deepEqual(deskPose(0, 17, a), { x: -220.54777959827334, y: 0.4, z: 236.08375149033964, ry: -0.006297166915610433 });
  assert.deepEqual(deskPose(11, 17, a), { x: 229.45222040172666, y: 0.4, z: 26.083751490339637, ry: -0.006297166915610433 });
  assert.deepEqual(deskPose(5, 17, a), { x: -70.54777959827334, y: 0.4, z: 131.08375149033964, ry: -0.006297166915610433 });
  assert.deepEqual([0, 5, 11].map((pi) => pileBase(pi, a)), [{ x: -225, z: -90 }, { x: -75, z: -240 }, { x: 225, z: -390 }]);
  assert.deepEqual(pilePose(5, 2, 23, a), { x: -75.50005589984357, y: 1.9, z: -240.88595652161166, ry: 0.04527760329656303 });
  assert.deepEqual(pileLabelPose(7, a), { x: 225, z: -184 });
  const c = a.cab;
  assert.deepEqual([c.cols, c.rows, c.width, c.height, c.depth, c.z], [4, 4, 650, 366, 240, -480]);
  assert.deepEqual([c.slots[0], c.slots[1], c.slots[12]], [{ x: -234, y: 310.5 }, { x: -78, y: 310.5 }, { x: -234, y: 67.5 }]);
  const c17 = arrange(12, 12, 17, false).cab;
  assert.deepEqual([c17.cols, c17.width, c17.slots[16]], [5, 806, { x: -156, y: 67.5 }]);
  assert.deepEqual(arrange(4, 2, 3, false).cab.slots[2], { x: 156, y: 67.5 });
  assert.deepEqual(cameraAt(0, 1.6, a), { look: [0, 0, 135], pos: [0, 460, 575] });
  const end = cameraAt(1, 1.6, a);
  assert.deepEqual(end.look, [0, 172.01999999999998, -480]);
  [0, 393.6847429839164, 258.8824766130548].forEach((v, k) => assert.ok(Math.abs(end.pos[k] - v) < 1e-9));
});

test('排法:手機桌面、週疊、櫃子都是 2 欄,前後不互相重疊', () => {
  const a = arrange(12, 12, 13, true);
  assert.deepEqual([a.cols, a.deskRows, a.pileCols, a.pileRows, a.front, a.cab.cols], [2, 6, 2, 6, 240, 2]);
  for (let seed = 1; seed < 40; seed++) {
    const p = deskPose(0, seed, a);
    const q = deskPose(1, seed + 1, a);
    const r = deskPose(2, seed + 2, a);
    assert.ok(q.x - half(q.ry).x > p.x + half(p.ry).x);
    assert.ok(p.z - half(p.ry).z > r.z + half(r.ry).z);
    const back = deskPose(11, seed, a);
    const label = pileLabelPose(0, a);
    assert.ok(back.z - half(back.ry).z - 4 > label.z + 9);
    const pile = pilePose(0, 0, seed, a);
    assert.ok(label.z - 9 > pile.z + half(pile.ry).z);
    const next = pileLabelPose(2, a);
    assert.ok(pile.z - half(pile.ry).z > next.z + 9);
  }
  assert.ok(pileBase(11, a).z - CARD.H > a.cab.z + DRAWER.D);
  assert.ok(a.cab.slots.every((s) => Math.abs(s.x) + DRAWER.W / 2 <= a.cab.width / 2 - CAB.SIDE));
});

for (const aspect of [0.46, 0.75, 1.33, 1.6]) {
  test(`鏡頭:畫面比例 ${aspect},桌上 12 張與 12 疊整個在畫面裡`, () => {
    const a = arrange(12, 12, 13, aspect < 1);
    const desk = Array.from({ length: 12 }, (_, s) => corners(deskPose(s, s * 3 + 1, a))).flat();
    const piles = Array.from({ length: 12 }, (_, pi) => corners(pilePose(pi, 4, pi * 5 + 2, a))).flat();
    if (a.narrow) assert.ok(inView(cameraAt(0, aspect, a), aspect, desk));
    else assert.ok(desk.every((pt) => Math.abs(project(cameraAt(0, aspect, a), aspect, pt)[1]) <= 0.95));
    assert.ok(inView(cameraAt(0.5, aspect, a), aspect, piles));
  });
}

test('鏡頭:手機的櫃子寬度放得進畫面,太高就往下帶,每排都看得到', () => {
  const aspect = 0.46;
  for (const n of [5, 13, 30, 60]) {
    const a = arrange(12, 12, n, true);
    const c = a.cab;
    const front = (s) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [s.x + (sx * DRAWER.W) / 2, s.y + (sy * DRAWER.H) / 2, c.z + DRAWER.D]);
    for (const p of [0.8, 1]) {
      const seen = c.slots.map(front).filter((q) => q.every((pt) => Math.abs(project(cameraAt(p, aspect, a), aspect, pt)[1]) <= 1));
      assert.ok(seen.length >= c.cols);
      assert.ok(seen.every((q) => q.every((pt) => Math.abs(project(cameraAt(p, aspect, a), aspect, pt)[0]) <= 1)));
    }
    for (let r = 0; r < c.rows; r++) {
      const row = c.slots.filter((_, k) => Math.floor(k / c.cols) === r).flatMap(front);
      assert.ok(Array.from({ length: 21 }, (_, k) => 0.8 + k * 0.01).some((p) => inView(cameraAt(p, aspect, a), aspect, row, 1)), `n=${n} row=${r}`);
    }
    const before = cameraAt(0.7999999, aspect, a);
    const at = cameraAt(0.8, aspect, a);
    before.pos.forEach((v, k) => assert.ok(Math.abs(v - at.pos[k]) < 0.01));
    const late = cameraAt(0.4999999, aspect, a);
    const mid = cameraAt(0.5, aspect, a);
    late.pos.forEach((v, k) => assert.ok(Math.abs(v - mid.pos[k]) < 0.01));
  }
  const tall = arrange(12, 12, 60, true);
  assert.ok(cameraAt(0.8, aspect, tall).look[1] > cameraAt(1, aspect, tall).look[1]);
});

test('來源主名稱、色相與色標位置是穩定的', () => {
  assert.equal(mainName('blog.bytebytego.com'), 'bytebytego');
  assert.equal(mainName('github.com'), 'github');
  assert.equal(mainName('localhost'), 'localhost');
  assert.equal(hueOf('bytebytego'), hueOf('bytebytego'));
  assert.ok(hueOf('a') >= 0 && hueOf('a') < 360);
  assert.ok([0, 1, 2, 3, 4].includes(tabSlot('Security')));
});

test('空與單則:桌上、週疊、分組都不出錯', () => {
  assert.deepEqual(pickDesk([], '2026-10-13'), { desk: [], piles: [] });
  assert.deepEqual(pickDesk([share('2026-10-13')], '2026-10-13'), { desk: [0], piles: [] });
  for (const mode of ['tag', 'source', 'month']) assert.deepEqual(groups([], mode), []);
});

test('全部過期:桌上放最新 4 張,其餘各進自己那一週的疊', () => {
  const items = ['2026-09-22', '2026-09-15', '2026-09-08', '2026-09-01', '2026-08-25', '2026-08-18'].map((d) => share(d));
  const { desk, piles } = pickDesk(items, '2026-10-13');
  assert.deepEqual(desk, [0, 1, 2, 3]);
  assert.deepEqual(piles, [{ week: '2026-08-24', ids: [4] }, { week: '2026-08-17', ids: [5] }]);
});

test('同日的張數維持輸入順序,桌上與週疊都是', () => {
  const same = Array.from({ length: 14 }, () => share('2026-10-13'));
  const { desk, piles } = pickDesk(same, '2026-10-13');
  assert.deepEqual(desk, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(piles, [{ week: '2026-10-12', ids: [12, 13] }]);
  const mixed = [...same, ...Array.from({ length: 3 }, () => share('2026-09-01'))];
  assert.deepEqual(pickDesk(mixed, '2026-10-13').piles, [{ week: '2026-10-12', ids: [12, 13] }, { week: '2026-08-31', ids: [14, 15, 16] }]);
});

test('跨週溢出:今天是週一,超出 12 張的進上一週的疊', () => {
  const items = [...Array.from({ length: 6 }, () => share('2026-10-12')), ...Array.from({ length: 6 }, () => share('2026-10-10')), share('2026-10-06')];
  const { desk, piles } = pickDesk(items, '2026-10-12');
  assert.equal(desk.length, DESK.MAX);
  assert.deepEqual(piles, [{ week: '2026-10-05', ids: [12] }]);
});

test('空檔:中間沒有轉發的週不佔疊,只計有轉發的週', () => {
  const items = [share('2026-10-13'), share('2026-10-12'), share('2026-10-11'), share('2026-10-10'), share('2026-05-26'), share('2026-05-19')];
  const { desk, piles } = pickDesk(items, '2026-10-13');
  assert.deepEqual(desk, [0, 1, 2, 3]);
  assert.deepEqual(piles, [{ week: '2026-05-25', ids: [4] }, { week: '2026-05-18', ids: [5] }]);
});

test('分組:剛好 60 張不拆', () => {
  const items = Array.from({ length: SPLIT }, () => share('2026-10-01', { g: ['AI/LLM'] }));
  assert.deepEqual(groups(items, 'tag').map((d) => [d.part, d.parts, d.ids.length]), [[0, 1, SPLIT]]);
});

test('分組:tag 與其他來源各 61 張都拆成兩格', () => {
  const tagged = Array.from({ length: SPLIT + 1 }, () => share('2026-10-01', { g: ['AI/LLM'] }));
  assert.deepEqual(groups(tagged, 'tag').map((d) => [d.part, d.parts, d.ids.length]), [[1, 2, SPLIT], [2, 2, 1]]);
  const singles = Array.from({ length: SPLIT + 1 }, (_, i) => share('2026-10-01', { s: `site${i}.com` }));
  assert.deepEqual(groups(singles, 'source').map((d) => [d.key, d.kind, d.part, d.parts, d.ids.length]), [['', 'other', 1, 2, SPLIT], ['', 'other', 2, 2, 1]]);
});

test('分組拆開時,第一格是較新的 60 張', () => {
  const items = days('2026-10-13', SPLIT + 1).map((d) => share(d, { g: ['AI/LLM'] }));
  const [first, second] = groups(items, 'tag');
  const p1 = first.ids.map((i) => items[i].d);
  const p2 = second.ids.map((i) => items[i].d);
  assert.ok(p1.every((d) => p2.every((e) => d >= e)));
});
