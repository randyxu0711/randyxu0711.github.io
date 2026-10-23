import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD, DESK, CAB, DRAWER, WINDOW, FOV, PITCH, IMG, PLATE,
  recent, thumb, groups, drawerWindow, cabinet, arrange, deskPose, liftPose, deskCam, deskAll, cabCam, TRAIL, tagged, trailDepth, trailPose, trailShown, mainName, tagOf, tagSlots, ROOM_DESK, deskRoom, drawerSink,
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

const PHONES = [[390, 844, true], [430, 932, true], [375, 667, false]];
const band = (w, h) => ({ aspect: w / h, top: 1 - 166 / h, bottom: 1 - (2 * (h - 101)) / h, cab: 1 - (2 * (h - 132)) / h });

test('直立螢幕的桌面全景:卡片貼著工具列上方,上面露出完整的抽屜,標籤不被 nav 切到', () => {
  for (const [w, h, tall] of PHONES) {
    const { aspect, top, bottom } = band(w, h);
    for (const n of [3, 8, 9, 13]) {
      const a = arrange(DESK.N, n, true);
      const poses = Array.from({ length: DESK.N }, (_, k) => deskPose(k, k + 1, a));
      const cam = deskAll(poses, aspect, a, bottom, top);
      const ys = poses.flatMap((p) => [-1, 1].map((s) => project(cam, aspect, [p.x, p.y, p.z + s * CARD.H / 2])[1]));
      assert.ok(Math.min(...ys) - bottom < 0.12, `${w}x${h} n=${n} anchored`);
      assert.ok(Math.max(...ys) <= top, `${w}x${h} n=${n} under nav`);
      const at = (y) => project(cam, aspect, [0, y, a.cab.z])[1];
      const rows = [...new Set(a.cab.slots.map((s) => s.y))];
      rows.forEach((y) => {
        const lo = at(y + PLATE.LO);
        const hi = at(y + PLATE.HI);
        assert.ok(hi < top || lo > top, `${w}x${h} n=${n} plate ${y} cut by nav`);
      });
      if (tall) {
        const y = Math.min(...rows);
        assert.ok(at(y + DRAWER.H / 2) < top && at(y - DRAWER.H / 2) > Math.max(...ys), `${w}x${h} n=${n} full drawer row`);
      }
    }
  }
});

test('直立螢幕的櫃子鏡頭:整個櫃子在 nav 與工具列之間,桌上的卡可以藏到工具列後面', () => {
  for (const [w, h] of [...PHONES, [390, 664], [375, 548]]) {
    const { aspect, top, cab } = band(w, h);
    for (const n of [1, 8, 9, 13]) {
      const a = arrange(DESK.N, n, true);
      const c = a.cab;
      const cam = cabCam(aspect, a, cab, top);
      const pts = [-1, 1].flatMap((sx) => [0, c.height].map((y) => [sx * c.width / 2, y, c.z]));
      const ps = pts.map((pt) => project(cam, aspect, pt));
      ps.forEach(([x, y]) => assert.ok(Math.abs(x) <= 1 && y <= top && y >= cab, `${w}x${h} n=${n}`));
      const xs = ps.map(([x]) => x);
      const ys = ps.map(([, y]) => y);
      assert.ok(Math.max(...xs) - Math.min(...xs) > 1.7 || Math.max(...ys) - Math.min(...ys) > 0.85 * (top - cab), `${w}x${h} n=${n} fills`);
      assert.ok(top - Math.max(...ys) < 0.08, `${w}x${h} n=${n} hangs under the nav`);
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
  assert.equal(tagOf('bytebytego'), tagOf('bytebytego'));
  assert.ok(['a', 'b', 'c', 'Frontend', 'AI/LLM'].every((s) => tagOf(s) >= 1 && tagOf(s) <= 8));
});

test('tag 依出現次數分色,最常見的幾個不撞色', () => {
  const items = [{ g: ['B', 'A'] }, { g: ['A', 'C'] }, { g: ['A', 'B'] }, { g: ['D'] }];
  const s = tagSlots(items);
  assert.deepEqual([s.get('A'), s.get('B'), s.get('C'), s.get('D')], [1, 2, 3, 4]);
  const many = Array.from({ length: 10 }, (_, i) => ({ g: ['t' + i] }));
  assert.equal(new Set([...tagSlots(many).values()]).size, 8);
});

test('空:分組不出錯', () => {
  assert.deepEqual(groups([]), []);
});

test('分組:tag 每個 tag 一份,張數多的在前,未分類最後', () => {
  const items = [share('2026-10-13', { g: ['AI/LLM', 'Security'] }), share('2026-10-12', { g: ['AI/LLM'] }), share('2026-10-11'), share('2026-10-10', { g: ['Backend'] })];
  const out = groups(items);
  assert.deepEqual(out.map((d) => [d.key, d.kind, d.ids]), [
    ['AI/LLM', 'tag', [0, 1]],
    ['Backend', 'tag', [3]],
    ['Security', 'tag', [0]],
    ['', 'untagged', [2]],
  ]);
});

test('分組:只依 tag,不看來源與年份', () => {
  const items = [share('2026-10-13', { s: 'a.com', g: ['AI/LLM'] }), share('2025-01-02', { s: 'b.com', g: ['AI/LLM'] }), share('2024-05-01', { s: 'a.com' })];
  const out = groups(items);
  assert.deepEqual(out.map((d) => [d.key, d.kind]), [['AI/LLM', 'tag'], ['', 'untagged']]);
  assert.ok(out.every((d) => d.kind === 'tag' || d.kind === 'untagged'));
});

test('分組:張數再多也不拆格', () => {
  const tagged = Array.from({ length: WINDOW * 3 }, () => share('2026-10-01', { g: ['AI/LLM'] }));
  assert.deepEqual(groups(tagged).map((d) => d.ids.length), [WINDOW * 3]);
});

test('抽屜窗口:張數不超過窗口時整格都在', () => {
  assert.equal(drawerWindow(WINDOW, 0), 0);
  assert.equal(drawerWindow(WINDOW, WINDOW - 1), 0);
});

test('抽屜窗口:翻過去的牌留幾張在前面,窗口跟著往後滑,到底停住', () => {
  const n = WINDOW * 3;
  assert.equal(drawerWindow(n, 0), 0);
  const starts = Array.from({ length: n }, (_, cur) => drawerWindow(n, cur));
  starts.forEach((st, cur) => {
    assert.ok(cur >= st && cur < st + WINDOW);
    assert.ok(st + WINDOW <= n);
    if (cur > 0) assert.ok(cur - 1 >= st, '上一張還在');
    if (cur < n - 1) assert.ok(cur + 1 < st + WINDOW, '下一張已經在');
    if (cur > 0) assert.ok(st - starts[cur - 1] <= 1, '一次只滑一張');
  });
  assert.equal(starts[n - 1], n - WINDOW);
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


test('wall sits right behind the catalog', () => {
  for (const narrow of [false, true]) {
    const a = arrange(6, 8, narrow);
    assert.equal(deskRoom(a).back, a.cab.z - a.cab.depth - ROOM_DESK.GAP);
  }
});

test('desk front clears the front row of clippings', () => {
  for (const narrow of [false, true]) {
    const a = arrange(6, 8, narrow);
    assert.ok(deskRoom(a).front > a.front + CARD.H / 2 + 100);
  }
});

test('desk is wider than the catalog', () => {
  const a = arrange(6, 20, false);
  assert.ok(deskRoom(a).width > a.cab.width + 400);
});

test('cards inside the cabinet sink below the drawer top', () => {
  const top = DRAWER.H / 2 + 28;
  assert.ok(top - drawerSink(top, -40) <= DRAWER.H / 2 - 2);
});

test('cards clear of the cabinet face stand at full height', () => {
  assert.equal(drawerSink(DRAWER.H / 2 + 28, 40), 0);
});

test('sinking eases as the card leaves the cabinet', () => {
  const top = DRAWER.H / 2 + 28;
  let last = Infinity;
  for (let z = -30; z <= 30; z += 2) {
    const s = drawerSink(top, z);
    assert.ok(s <= last + 1e-9);
    last = s;
  }
});

test('cards that already fit never sink', () => {
  assert.equal(drawerSink(DRAWER.H / 2 - 10, -40), 0);
});
