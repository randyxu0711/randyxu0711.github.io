import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD, DESK, PILES, CAB, DRAWER, SPLIT,
  taipeiToday, weekStart, pickDesk, groups, cabinet, deskPose, pilePose, pileBase, pileLabelPose, cameraAt, mainName, hueOf, tabSlot,
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
  const cab = cabinet(13);
  const near = cameraAt(0.4999999, 1.6, cab);
  const mid = cameraAt(0.5, 1.6, cab);
  near.pos.forEach((v, k) => assert.ok(Math.abs(v - mid.pos[k]) < 0.01));
  assert.deepEqual(cameraAt(0, 1.6, cab).look, [0, 0, 135]);
  const end = cameraAt(1, 1.6, cab);
  assert.equal(end.look[2], cab.z);
  assert.ok(end.pos[2] > cab.z);
  assert.ok(cameraAt(0, 0.5, cab).pos[1] > cameraAt(0, 1.6, cab).pos[1]);
  assert.deepEqual(cameraAt(2, 1.6, cab), cameraAt(1, 1.6, cab));
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
