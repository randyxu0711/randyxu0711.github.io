import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD, DESK, CAB, DRAWER, SPLIT, FOV, PITCH, IMG,
  recent, thumb, groups, cabinet, arrange, deskPose, liftPose, deskCam, deskAll, cabCam, TRAIL, tagged, trailDepth, trailPose, trailShown, mainName, hueOf,
} from 'shares3d/layout.js';

const share = (d, extra = {}) => ({ d, s: 'example.com', g: [], ...extra });
const days = (from, n) => {
  const out = [];
  for (let k = 0; k < n; k++) out.push(new Date(Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10)) - k * 86400000).toISOString().slice(0, 10));
  return out;
};
const TAN = Math.tan((FOV / 2) * Math.PI / 180);
const project = (cam, aspect, pt) => {
  const sub = (u, v) => u.map((x, k) => x - v[k]);
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const unit = (u) => u.map((x) => x / Math.hypot(...u));
  const fwd = unit(sub(cam.look, cam.pos));
  const right = unit(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const d = sub(pt, cam.pos);
  const depth = dot(d, fwd);
  return [dot(d, right) / depth / (TAN * aspect), dot(d, up) / depth / TAN];
};
const inView = (cam, aspect, pts, m = 1) => pts.every((pt) => {
  const [x, y] = project(cam, aspect, pt);
  return Math.abs(x) <= m && Math.abs(y) <= m;
});
const liftCorners = (p) => [-1, 1].flatMap((sx) => [-1, 1].map((sy) => [
  p.x + sx * CARD.W / 2,
  p.y + sy * (CARD.H / 2) * Math.cos(PITCH.DESK),
  p.z - sy * (CARD.H / 2) * Math.sin(PITCH.DESK),
]));
const VIEWS = [[false, 1.6], [false, 1.33], [false, 2.2], [true, 0.46], [true, 0.75]];

test('桌上:最新的 6 張,不足就全部', () => {
  const items = days('2026-10-13', 9).map((d) => share(d));
  assert.deepEqual(recent(items), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(recent(items.slice(0, 2)), [0, 1]);
  assert.deepEqual(recent([]), []);
});

test('縮圖網址:wsrv.nl 轉 webp,原網址整段編碼', () => {
  assert.equal(thumb(null), null);
  assert.equal(thumb(''), null);
  assert.equal(
    thumb('https://a.com/x.png?w=1&h=2'),
    'https://wsrv.nl/?url=https%3A%2F%2Fa.com%2Fx.png%3Fw%3D1%26h%3D2&w=640&h=336&fit=cover&output=webp',
  );
  assert.ok(Math.abs(CARD.W / IMG.H - 1.91) < 0.01);
});

test('桌上的卡不互相重疊,都在櫃子前面', () => {
  const half = (ry) => ({ x: (CARD.W / 2) * Math.cos(ry) + (CARD.H / 2) * Math.abs(Math.sin(ry)), z: (CARD.H / 2) * Math.cos(ry) + (CARD.W / 2) * Math.abs(Math.sin(ry)) });
  for (const narrow of [false, true]) {
    const a = arrange(DESK.N, 13, narrow);
    const poses = Array.from({ length: DESK.N }, (_, k) => deskPose(k, k * 3 + 1, a));
    for (let i = 0; i < poses.length; i++) {
      for (let j = i + 1; j < poses.length; j++) {
        const p = poses[i];
        const q = poses[j];
        const hp = half(p.ry);
        const hq = half(q.ry);
        assert.ok(Math.abs(p.x - q.x) > hp.x + hq.x || Math.abs(p.z - q.z) > hp.z + hq.z, `narrow=${narrow} ${i} ${j}`);
      }
      assert.ok(poses[i].z - half(poses[i].ry).z > a.cab.z + 40, `narrow=${narrow} ${i} cab`);
    }
  }
});

test('立起來那張:正對桌面鏡頭,不穿過桌面', () => {
  const a = arrange(DESK.N, 13, false);
  const p = liftPose(0, 1, a);
  assert.equal(p.rx, -PITCH.DESK);
  assert.ok(p.y - (CARD.H / 2) * Math.cos(PITCH.DESK) >= DESK.GAP - 1e-9);
});

test('桌面鏡頭:整張立起來的卡在畫面裡,手機佔大半寬度', () => {
  for (const [narrow, aspect] of VIEWS) {
    const a = arrange(DESK.N, 13, narrow);
    for (let k = 0; k < DESK.N; k++) {
      const p = liftPose(k, k + 1, a);
      const cam = deskCam(p, aspect, a);
      assert.ok(inView(cam, aspect, liftCorners(p), 0.97), `narrow=${narrow} aspect=${aspect} k=${k}`);
      const [l] = project(cam, aspect, [p.x - CARD.W / 2, p.y, p.z]);
      const [r] = project(cam, aspect, [p.x + CARD.W / 2, p.y, p.z]);
      const [, top] = project(cam, aspect, liftCorners(p)[1]);
      const [, bottom] = project(cam, aspect, liftCorners(p)[0]);
      assert.ok((r - l) / 2 > (narrow ? 0.5 : 0.35) || (top - bottom) / 2 > 0.5, `narrow=${narrow} aspect=${aspect} size`);
      const dir = cam.look.map((v, i) => v - cam.pos[i]);
      assert.ok(Math.abs(Math.atan2(-dir[1], Math.hypot(dir[0], dir[2])) - PITCH.DESK) < 1e-6);
    }
  }
});

test('直立螢幕:左右的鄰卡露出一截,點得到', () => {
  for (const aspect of [0.46, 0.75]) {
    const a = arrange(DESK.N, 13, true);
    for (let k = 0; k < DESK.N; k++) {
      const cam = deskCam(liftPose(k, k + 1, a), aspect, a);
      const n = deskPose(k % 2 ? k - 1 : k + 1, k + 2, a);
      const near = n.x + (k % 2 ? CARD.W / 2 : -CARD.W / 2);
      const [x] = project(cam, aspect, [near, n.y, n.z]);
      assert.ok(Math.abs(x) < 0.85, `aspect=${aspect} k=${k} x=${x}`);
    }
  }
});

test('桌面鏡頭避開底部工具列:立起來那張整張在工具列上面', () => {
  for (const [narrow, aspect] of VIEWS) {
    const a = arrange(DESK.N, 13, narrow);
    for (const [bottom, top] of [[-1, 1], [-0.7, 0.86], [-0.5, 0.78]]) {
      const p = liftPose(0, 1, a);
      const cam = deskCam(p, aspect, a, bottom, top);
      liftCorners(p).forEach((pt) => {
        const [x, y] = project(cam, aspect, pt);
        assert.ok(Math.abs(x) <= 1 && y <= top && y >= bottom, `narrow=${narrow} aspect=${aspect} bottom=${bottom} top=${top}`);
      });
    }
  }
});

test('桌面全景:6 張都在畫面裡、工具列上面,俯角不變', () => {
  for (const [narrow, aspect] of VIEWS) {
    const a = arrange(DESK.N, 13, narrow);
    const poses = Array.from({ length: DESK.N }, (_, k) => deskPose(k, k + 1, a));
    for (const [bottom, top] of [[-1, 1], [-0.6, 0.78]]) {
      const cam = deskAll(poses, aspect, a, bottom, top);
      poses.forEach((p) => [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
        const [x, y] = project(cam, aspect, [p.x + sx * CARD.W / 2, p.y, p.z + sz * CARD.H / 2]);
        assert.ok(Math.abs(x) <= 1 && y <= top && y >= bottom, `narrow=${narrow} aspect=${aspect} bottom=${bottom}`);
      })));
      const dir = cam.look.map((v, i) => v - cam.pos[i]);
      assert.ok(Math.abs(Math.atan2(-dir[1], Math.hypot(dir[0], dir[2])) - PITCH.DESK) < 1e-6);
    }
  }
});

test('相關卡:同 tag 的卡,點的那張排第一,其餘照原本順序接在後面(循環)', () => {
  const items = [{ g: ['A', 'B'] }, { g: ['B'] }, { g: [] }, { g: ['A'] }, { g: ['A'] }];
  assert.deepEqual(tagged(items, 'A', 0), [0, 3, 4]);
  assert.deepEqual(tagged(items, 'A', 3), [3, 4, 0]);
  assert.deepEqual(tagged(items, 'B', 1), [1, 0]);
  assert.deepEqual(tagged(items, 'C', 0), []);
  assert.deepEqual([0, 1, 2].map((j) => trailDepth(j, 1, 3)), [2, 0, 1]);
});

test('相關卡:全部疊在主角後面、上緣一張比一張高,不壓到 nav', () => {
  for (const [narrow, aspect] of VIEWS) {
    const a = arrange(DESK.N, 13, narrow);
    for (let k = 0; k < DESK.N; k++) {
      const hero = liftPose(k, k + 1, a);
      const cam = deskCam(hero, aspect, a, -0.7, 0.86);
      const top = (d) => {
        const p = trailPose(hero, d);
        return project(cam, aspect, [p.x, p.y + (CARD.H / 2) * Math.cos(PITCH.DESK), p.z - (CARD.H / 2) * Math.sin(PITCH.DESK)])[1];
      };
      for (let d = 1; d <= TRAIL.SHOW; d++) {
        assert.ok(top(d) > top(d - 1), `narrow=${narrow} aspect=${aspect} k=${k} d=${d}`);
        assert.ok(top(d) <= 0.86, `narrow=${narrow} aspect=${aspect} k=${k} d=${d} under nav`);
        assert.ok(trailPose(hero, d).z < hero.z, 'behind the hero');
        assert.equal(trailPose(hero, d).x, hero.x, 'never off to the side');
      }
      assert.deepEqual(trailPose(hero, TRAIL.SHOW + 4), trailPose(hero, TRAIL.SHOW));
    }
  }
  assert.deepEqual([0, TRAIL.SHOW, TRAIL.SHOW + 1].map(trailShown), [true, true, false]);
});

test('櫃子鏡頭:整個櫃子在畫面裡,幾乎平視', () => {
  for (const [narrow, aspect] of VIEWS) {
    for (const n of [1, 9, 13, 30]) {
      const a = arrange(DESK.N, n, narrow);
      const c = a.cab;
      const cam = cabCam(aspect, a);
      const pts = [-1, 1].flatMap((sx) => [0, c.height].map((y) => [sx * c.width / 2, y, c.z]));
      assert.ok(inView(cam, aspect, pts), `narrow=${narrow} aspect=${aspect} n=${n}`);
      const dir = cam.look.map((v, i) => v - cam.pos[i]);
      assert.ok(Math.abs(Math.atan2(-dir[1], Math.hypot(dir[0], dir[2])) - PITCH.CAB) < 1e-6);
      assert.ok(cam.pos[2] > c.z);
    }
  }
});

test('來源主名稱與色相是穩定的', () => {
  assert.equal(mainName('blog.bytebytego.com'), 'bytebytego');
  assert.equal(mainName('github.com'), 'github');
  assert.equal(mainName('localhost'), 'localhost');
  assert.equal(hueOf('bytebytego'), hueOf('bytebytego'));
  assert.ok(hueOf('a') >= 0 && hueOf('a') < 360);
});

test('空:分組不出錯', () => {
  for (const mode of ['tag', 'source', 'year']) assert.deepEqual(groups([], mode), []);
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

test('分組:來源最多 7 格,張數少的併進其他來源', () => {
  const items = [];
  for (let k = 0; k < 9; k++) for (let j = 0; j <= 9 - k; j++) items.push(share('2026-10-01', { s: `s${k}.com` }));
  const out = groups(items, 'source');
  assert.deepEqual(out.map((d) => d.key), ['s0.com', 's1.com', 's2.com', 's3.com', 's4.com', 's5.com', 's6.com', '']);
  assert.equal(out[7].kind, 'other');
  assert.equal(out[7].ids.length, 3 + 2);
  assert.deepEqual(out[7].ids, [...out[7].ids].sort((a, b) => a - b));
});

test('分組:年份新到舊', () => {
  const items = [share('2026-10-13'), share('2026-01-01'), share('2025-12-31'), share('2024-05-01')];
  assert.deepEqual(groups(items, 'year').map((d) => [d.key, d.kind, d.ids]), [['2026', 'year', [0, 1]], ['2025', 'year', [2]], ['2024', 'year', [3]]]);
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
