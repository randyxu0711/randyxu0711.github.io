# 分享頁 WebGL 版 階段 2:場景與逛 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/shares-3d/` 做出可以捲動逛的剪報桌:真的 share 資料攤在桌上、往後一週一疊、最後是目錄櫃(可切換 tag / 來源 / 月份),晝夜主題與夜間檯燈都正常;還不能點卡片(階段 3)。

**Architecture:** 純函式 `assets/shares3d/layout.js` 決定一切位置(桌上哪幾張、週疊、抽屜分組、櫃子尺寸、鏡頭路徑),用 `node:test` 鎖住;
`scene.js` 用 three.js InstancedMesh 一次畫完所有卡片 / 色標 / 便利貼 / 抽屜,shader 共用 `scene3d/glsl.js`;
`textures.js` 把卡片正面與抽屜標籤畫成**遮罩**(R 標題、G 次要文字、B 印章),顏色在 shader 裡從 token 上色,換主題不必重畫;
`main.js` 接資料、捲動、主題、語言、分組切換。沒有 JS / WebGL 時顯示現在的卡片格狀清單(保底)。

**Tech Stack:** Jekyll 4.4(Docker 建置)、three.js r170(`assets/vendor/three/`)、原生 ES modules + import map、Node 內建 `node:test`。

**Spec:** `docs/shares-webgl.md`(〈動線〉〈卡片〉的「場景裡」、〈燈光〉的夜間桌面 / 櫃子兩列、〈保底與無障礙〉的保底清單、〈技術〉)

## Global Constraints

- **只在本機分支 `shares-webgl` commit,不 push、不開 PR**(使用者要求;開發紀錄留在本機分支)。
- 書架(`/books/`)的行為不能變。
- 程式放 `assets/shares3d/` 與 `assets/scene3d/`,**不放 `assets/modules/`**;import 一律用裸名稱(`scene3d/…`、`shares3d/…`),
  import map 與 modulepreload 都要列,網址帶 `?v={{ site.time | date: '%s' }}`。
- **元件不寫色碼**:顏色都從 CSS token 讀(新 token `--rule`、`--redline`、`--sticky`);例外是來自資料的顏色(印章依網域、色標依 tag 的色相)。
- 介面文字放 `_data/i18n.yml`;share 的標題不翻譯。tag 清單只在 issue form 那一份,程式不列 tag(色相與位置用 tag 名稱的雜湊)。
- 不寫註解(使用者偏好)。
- 前端純函式用 `node:test`(不加 npm 依賴);其餘靠建置 + htmlproofer + 使用者手動檢查。手動檢查交給使用者,我們只回報自動檢查結果。
- commit 訊息中文、`type(scope): 說明`,結尾 `Co-Authored-By: <實際執行的模型> <noreply@anthropic.com>`。
- 單位:世界座標用公釐(索引卡 127 × 76,真的 5 × 3 吋)。

建置與檢查指令(後面的步驟直接引用):

```bash
# 建置
docker run --rm -v "$PWD":/srv -v jekyll-bundle:/usr/local/bundle -w /srv ruby:3.4 \
  bash -c "bundle install --quiet && bundle exec jekyll build"
# 建置後檢查
docker run --rm -v "$PWD":/srv -v jekyll-bundle:/usr/local/bundle -w /srv ruby:3.4 \
  bash -c "bundle install --quiet && bundle exec htmlproofer _site --disable-external --ignore-urls '/^http:\/\/127.0.0.1/,/^http:\/\/0.0.0.0/,/^http:\/\/localhost/'"
# Node 測試(全部)
node --import ./tools/scene3d/hooks.mjs --test tools/scene3d/intro.test.mjs tools/scene3d/text.test.mjs tools/shares3d/layout.test.mjs
```

環境:shell hook 會把 `grep` 改寫成 ripgrep,需要精確 grep 語法時用 `rtk proxy grep`。Docker 會留下 root 擁有的 `_site/`、`.jekyll-cache/`(已 gitignore,不用處理)。

## Review Focus

1. **shader 編譯失敗就整頁黑掉**(本機沒有瀏覽器能自動測):`uInk` 由 `SKETCH` 片段宣告、`uDesk` 要在 `SKETCH` 之前宣告、
   每個 vertex shader 要寫 `vWorld`、`texture2D` 不放在非一致的分支裡。預期:三個 three.js 的 ShaderMaterial 在 WebGL2 編譯通過。
   → Task 4 Step 3 的 shader 逐項檢查表;最後的整體審查逐行看 GLSL。
2. **資料 JSON 壞掉**(標題含引號、`</script>`、沒有 tags 或 note 的 share):預期 JSON 一定能解析,沒有 note 是 `null`、沒有 tags 是 `[]`。
   → Task 3 Step 6 用 Python 解析建置出來的 JSON。
3. **share 很少或很舊時**(0 則、1 則、全部超過 7 天):預期桌上至少有可用的卡(不到 4 則就全部上桌),沒有週疊也能畫,0 則顯示保底清單的「還沒有分享的文章」。
   → Task 2 的 pickDesk 測試;Task 5 Step 3 的 0 則檢查。
4. **WebGL 或模組失敗時沒有保底**:預期 `shares3d`、`scene3d`、`three` 任一個 404 或丟錯,`.fail` 會出現、看到完整格狀清單;
   有 JS 時首次繪製不閃出清單。→ Task 3 Step 6(main.js 還不存在時就是 404 情境)。
5. **主題 / 語言切換後顏色或文字沒更新**:預期換主題時桌面、卡片、印章、色標、抽屜立即換色(遮罩貼圖不重畫);換語言時抽屜與週疊標籤重畫。
   → Task 5 手動檢查清單第 4、5 項。

---

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `assets/scene3d/text.js` | 新增(`wrap`、`isCJK` 從 `books3d/textures.js` 搬來)| 換行(中文逐字、英文斷字)與截斷加刪節號 |
| `assets/books3d/textures.js` | 修改 | 改 import `scene3d/text.js` |
| `_layouts/books.html` | 修改 | `shared:` 加 `text.js` |
| `assets/shares3d/layout.js` | 新增 | 純函式:桌上 / 週疊 / 抽屜分組 / 櫃子 / 位置 / 鏡頭路徑 |
| `assets/shares3d/textures.js` | 新增 | 卡片正面遮罩的貼圖池、抽屜與週疊標籤、字型 |
| `assets/shares3d/scene.js` | 新增 | three.js 場景、shader、instanced 物件與 setter |
| `assets/shares3d/main.js` | 新增 | 資料、捲動鏡頭、主題、語言、分組切換、檯燈 |
| `assets/shares3d/shares3d.css` | 新增 | canvas、保底清單、捲動長度、分組鍵 |
| `_layouts/shares.html`、`shares-3d.md` | 新增 | 路由 `/shares-3d/`、資料 JSON、保底清單、分組鍵 |
| `_includes/head.html` | 修改 | `page.noindex` 時輸出 robots noindex |
| `assets/css/tokens.css` | 修改 | `--rule`、`--redline`、`--sticky`(晝夜與舊瀏覽器備援) |
| `_data/i18n.yml` | 修改 | `shares3d.*` 介面文字 |
| `tools/scene3d/resolve.mjs` | 修改 | 也認 `shares3d/` 裸名稱 |
| `tools/scene3d/text.test.mjs`、`tools/shares3d/layout.test.mjs` | 新增 | 測試 |
| `.github/workflows/test.yml` | 修改 | node job 跑新測試、paths 加 `assets/shares3d/**` |

---

### Task 1: `scene3d/text.js`:換行與截斷(書架改用它)

**Files:**
- Create: `assets/scene3d/text.js`、`tools/scene3d/text.test.mjs`
- Modify: `assets/books3d/textures.js`(刪掉 `isCJK` 與 `wrap`,改 import)、`_layouts/books.html`(`shared:`)、`.github/workflows/test.yml`

**Interfaces:**
- Produces: `scene3d/text.js` 匯出 `isCJK(ch) → boolean`、`wrap(ctx, text, maxW) → string[]`(與書架原本的逐字相同)、
  `clampLines(ctx, lines, max, maxW) → string[]`(超過 `max` 行時截斷,最後一行加 `…` 且不超過 `maxW`;沒超過時回傳同一個陣列)。

- [ ] **Step 1: 寫失敗的測試** — `tools/scene3d/text.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrap, clampLines, isCJK } from 'scene3d/text.js';

const ctx = { measureText: (s) => ({ width: Array.from(s).length * 10 }) };

test('英文在空白處換行', () => {
  assert.deepEqual(wrap(ctx, 'agent identity drafts', 100), ['agent', 'identity', 'drafts']);
});

test('中文逐字換行', () => {
  assert.deepEqual(wrap(ctx, '目錄櫃的抽屜卡片', 30), ['目錄櫃', '的抽屜', '卡片']);
  assert.equal(isCJK('中'), true);
  assert.equal(isCJK('a'), false);
});

test('超過行數時最後一行加刪節號且不超寬', () => {
  const out = clampLines(ctx, ['aaaa', 'bbbb', 'cccc'], 2, 40);
  assert.deepEqual(out, ['aaaa', 'bbb…']);
  assert.ok(ctx.measureText(out[1]).width <= 40);
});

test('沒超過行數時原樣回傳', () => {
  const lines = ['a', 'b'];
  assert.equal(clampLines(ctx, lines, 5, 40), lines);
});
```

- [ ] **Step 2: 確認失敗**

Run: `node --import ./tools/scene3d/hooks.mjs --test tools/scene3d/text.test.mjs`
Expected: FAIL,找不到 `assets/scene3d/text.js`。

- [ ] **Step 3: 實作 `assets/scene3d/text.js`**(`isCJK` 與 `wrap` 從 `assets/books3d/textures.js` 原封不動搬來,只加 `export`):

```js
export const isCJK = (ch) => ch.codePointAt(0) >= 0x2e80;

export function wrap(ctx, text, maxW) {
  const lines = [];
  let line = '';
  let lastSpace = -1;
  Array.from(text).forEach((ch) => {
    const next = line + ch;
    if (line && ctx.measureText(next).width > maxW) {
      if (!isCJK(ch) && lastSpace > 0) {
        lines.push(line.slice(0, lastSpace));
        line = line.slice(lastSpace + 1) + ch;
      } else {
        lines.push(line);
        line = ch === ' ' ? '' : ch;
      }
      lastSpace = line.lastIndexOf(' ');
    } else {
      line = next;
      if (ch === ' ') lastSpace = line.length - 1;
    }
  });
  if (line) lines.push(line);
  return lines;
}

export function clampLines(ctx, lines, max, maxW) {
  if (lines.length <= max) return lines;
  const out = lines.slice(0, max);
  let last = Array.from(out[max - 1]);
  while (last.length && ctx.measureText(last.join('') + '…').width > maxW) last.pop();
  out[max - 1] = last.join('') + '…';
  return out;
}
```

- [ ] **Step 4: 確認通過**

Run: 同 Step 2。Expected: `# pass 4`、`# fail 0`。

- [ ] **Step 5: 書架改用共用的 `wrap`**

`assets/books3d/textures.js`:刪掉 `const isCJK = (ch) => …;` 這一行與整個 `export function wrap(ctx, text, maxW) { … }`,
在 `import * as THREE from 'three';` 下一行加 `import { isCJK, wrap } from 'scene3d/text.js';`。
`_layouts/books.html` front matter:`shared: [anim.js, colors.js, intro.js, text.js, glsl.js, geometry.js]`。

確認:`diff <(git show HEAD:assets/books3d/textures.js | sed -n '/^export function wrap/,/^}/p') <(sed -n '/^export function wrap/,/^}/p' assets/scene3d/text.js) && echo SAME`
Expected: `SAME`。`node --check assets/books3d/textures.js && echo OK` → `OK`。

- [ ] **Step 6: CI 跑新測試**

`.github/workflows/test.yml` 的 node job 那行改成:

```yaml
      - run: node --import ./tools/scene3d/hooks.mjs --test tools/scene3d/intro.test.mjs tools/scene3d/text.test.mjs
```

- [ ] **Step 7: 建置並確認書架載入 text.js**

Run: 〈建置〉,接著 `rtk proxy grep -o '"scene3d/text.js": "[^"]*"' _site/books/index.html`。Expected: 一行,帶 `?v=`。

- [ ] **Step 8: Commit**

```bash
git add assets/scene3d/text.js tools/scene3d/text.test.mjs assets/books3d/textures.js _layouts/books.html .github/workflows/test.yml
git commit -m "refactor(scene3d): 換行函式抽成 text.js,加 clampLines 與測試;書架改用共用版本"
```
(訊息結尾加 Co-Authored-By 那行,下同。)

---

### Task 2: `shares3d/layout.js`:位置與分組的純函式(TDD)

**Files:**
- Create: `assets/shares3d/layout.js`、`tools/shares3d/layout.test.mjs`
- Modify: `tools/scene3d/resolve.mjs`(也認 `shares3d/`)、`.github/workflows/test.yml`

**Interfaces:**
- Consumes: `scene3d/anim.js` 的 `clamp, lerp`。
- Produces(`shares3d/layout.js`):
  - 常數 `CARD {W:127,H:76,T:0.6}`、`DESK`、`PILES`、`DRAWER {W:150,H:75,GAP:6,D:8}`、`CAB {Z:-480,DEPTH:240,SIDE:10,BASE:24,TOP:12}`、`SPLIT = 60`、`FOV = 35`。
  - `taipeiToday(ms) → 'YYYY-MM-DD'`、`weekStart(d) → 'YYYY-MM-DD'`(週一)。
  - `pickDesk(items, today) → { desk: number[], piles: [{ week, ids: number[] }] }`:`items` 是新到舊、每則有 `d: 'YYYY-MM-DD'`;
    回傳的是 `items` 的索引,`desk` 與每疊的 `ids` 都是新到舊。
  - `groups(items, mode) → [{ key, kind, ids, part, parts }]`:`mode` 是 `'tag' | 'source' | 'month'`;`kind` 是 `mode` 本身或 `'other'`(只有 1 張的來源)/`'untagged'`;
    `part = 0` 表示沒拆,拆的時候 `part` 從 1 起算。每則需要 `s`(來源)、`g`(tag 陣列)、`d`。
  - `cabinet(n) → { cols, rows, width, height, depth, z, slots: [{x, y}] }`(slots 是抽屜面板中心)。
  - `deskPose(slot, seed)`、`pilePose(pileIndex, k, seed)` → `{ x, y, z, ry }`(`k` 由下往上);`pileBase(pi)`、`pileLabelPose(pi) → { x, z }`。
  - `cameraAt(p, aspect, cab) → { pos: [x,y,z], look: [x,y,z] }`(`p` 是 0–1 的捲動進度)。
  - `hash(s)`、`mainName(host)`(`blog.bytebytego.com → bytebytego`)、`hueOf(s) → 0–359`、`tabSlot(tag) → 0–4`、`seeded(seed) → () => [0,1)`。

- [ ] **Step 1: Node 也認 `shares3d/` 裸名稱** — `tools/scene3d/resolve.mjs` 改成:

```js
const ROOT = new URL('../../assets/', import.meta.url);

export async function resolve(spec, ctx, next) {
  if (spec.startsWith('scene3d/') || spec.startsWith('shares3d/')) return { url: new URL(spec, ROOT).href, format: 'module', shortCircuit: true };
  return next(spec, ctx);
}
```

- [ ] **Step 2: 寫失敗的測試** — `tools/shares3d/layout.test.mjs`:

```js
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
```

- [ ] **Step 3: 確認失敗**

Run: `node --import ./tools/scene3d/hooks.mjs --test tools/shares3d/layout.test.mjs`
Expected: FAIL,找不到 `assets/shares3d/layout.js`。

- [ ] **Step 4: 實作 `assets/shares3d/layout.js`**

```js
import { clamp, lerp } from 'scene3d/anim.js';

export const CARD = { W: 127, H: 76, T: 0.6 };
export const DESK = { MIN: 4, MAX: 12, DAYS: 7, COLS: 4, PITCH_X: 150, PITCH_Z: 105, FRONT: 240 };
export const PILES = { MAX: 12, COLS: 4, PITCH_X: 150, PITCH_Z: 150, BACK: -90, LABEL: 56 };
export const DRAWER = { W: 150, H: 75, GAP: 6, D: 8 };
export const CAB = { Z: -480, DEPTH: 240, SIDE: 10, BASE: 24, TOP: 12 };
export const SPLIT = 60;
export const FOV = 35;
const DAY = 86400000;

export function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

export function mainName(host) {
  const p = String(host).split('.');
  return p[Math.max(0, p.length - 2)] || String(host);
}

export const hueOf = (s) => hash(s) % 360;

export const tabSlot = (tag) => hash(tag) % 5;

export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const jitter = (r, s) => (r() * 2 - 1) * s;

export function taipeiToday(ms) {
  return new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
}

const dayNum = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / DAY;

const fromDayNum = (n) => new Date(n * DAY).toISOString().slice(0, 10);

export function weekStart(d) {
  const n = dayNum(d);
  return fromDayNum(n - ((new Date(n * DAY).getUTCDay() + 6) % 7));
}

export function pickDesk(items, today) {
  const from = dayNum(today) - (DESK.DAYS - 1);
  let recent = 0;
  while (recent < items.length && dayNum(items[recent].d) >= from) recent++;
  const n = Math.min(DESK.MAX, Math.max(Math.min(DESK.MIN, items.length), recent));
  const desk = items.slice(0, n).map((_, i) => i);
  const piles = [];
  for (let i = n; i < items.length; i++) {
    const week = weekStart(items[i].d);
    let p = piles[piles.length - 1];
    if (!p || p.week !== week) {
      if (piles.length === PILES.MAX) break;
      p = { week, ids: [] };
      piles.push(p);
    }
    p.ids.push(i);
  }
  return { desk, piles };
}

export function groups(items, mode) {
  const map = new Map();
  const add = (key, i) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(i);
  };
  items.forEach((it, i) => {
    if (mode === 'source') add(it.s, i);
    else if (mode === 'month') add(it.d.slice(0, 7), i);
    else if (it.g.length) it.g.forEach((g) => add(g, i));
    else add('', i);
  });
  let list = [...map].map(([key, ids]) => ({ key, kind: mode === 'tag' && key === '' ? 'untagged' : mode, ids }));
  if (mode === 'source') {
    const other = list.filter((d) => d.ids.length < 2).flatMap((d) => d.ids).sort((a, b) => a - b);
    list = list.filter((d) => d.ids.length >= 2);
    if (other.length) list.push({ key: '', kind: 'other', ids: other });
  }
  const last = (d) => (d.kind === 'other' || d.kind === 'untagged' ? 1 : 0);
  if (mode === 'month') list.sort((a, b) => (a.key < b.key ? 1 : -1));
  else list.sort((a, b) => last(a) - last(b) || b.ids.length - a.ids.length || a.key.localeCompare(b.key));
  return list.flatMap((d) => {
    if (d.ids.length <= SPLIT) return [{ ...d, part: 0, parts: 1 }];
    const parts = Math.ceil(d.ids.length / SPLIT);
    return Array.from({ length: parts }, (_, k) => ({ ...d, ids: d.ids.slice(k * SPLIT, (k + 1) * SPLIT), part: k + 1, parts }));
  });
}

export function cabinet(n) {
  const cols = n > 16 ? 5 : Math.max(1, Math.min(4, n));
  const rows = Math.max(1, Math.ceil(n / cols));
  const width = cols * DRAWER.W + (cols + 1) * DRAWER.GAP + 2 * CAB.SIDE;
  const height = CAB.BASE + rows * DRAWER.H + (rows + 1) * DRAWER.GAP + CAB.TOP;
  const slots = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    slots.push({
      x: -width / 2 + CAB.SIDE + DRAWER.GAP + c * (DRAWER.W + DRAWER.GAP) + DRAWER.W / 2,
      y: CAB.BASE + DRAWER.GAP + (rows - 1 - r) * (DRAWER.H + DRAWER.GAP) + DRAWER.H / 2,
    });
  }
  return { cols, rows, width, height, depth: CAB.DEPTH, z: CAB.Z, slots };
}

export function deskPose(slot, seed) {
  const r = seeded(seed * 7 + 1);
  const col = slot % DESK.COLS;
  const row = Math.floor(slot / DESK.COLS);
  return {
    x: (col - (DESK.COLS - 1) / 2) * DESK.PITCH_X + jitter(r, 5),
    y: CARD.T / 2 + 0.1,
    z: DESK.FRONT - row * DESK.PITCH_Z + jitter(r, 4),
    ry: jitter(r, 0.07),
  };
}

export function pileBase(pi) {
  const col = pi % PILES.COLS;
  const row = Math.floor(pi / PILES.COLS);
  return { x: (col - (PILES.COLS - 1) / 2) * PILES.PITCH_X, z: PILES.BACK - row * PILES.PITCH_Z };
}

export function pilePose(pi, k, seed) {
  const b = pileBase(pi);
  const r = seeded(seed * 13 + 5);
  return { x: b.x + jitter(r, 3), y: CARD.T / 2 + 0.1 + k * (CARD.T + 0.15), z: b.z + jitter(r, 3), ry: jitter(r, 0.1) };
}

export function pileLabelPose(pi) {
  const b = pileBase(pi);
  return { x: b.x, z: b.z + PILES.LABEL };
}

const smooth = (x) => x * x * (3 - 2 * x);

export function cameraAt(p, aspect, cab) {
  const f = aspect < 1.3 ? clamp(1.3 / aspect, 1, 2.3) : 1;
  const t = Math.tan((FOV / 2) * Math.PI / 180);
  const dist = Math.max((cab.height / 2 + 30) / t, (cab.width / 2 + 30) / (t * aspect)) * 1.05;
  const keys = [
    { look: [0, 0, 135], off: [0, 460 * f, 440 * f] },
    { look: [0, 0, -240], off: [0, 500 * f, 420 * f] },
    { look: [0, cab.height * 0.47, cab.z], off: [0, dist * 0.3, dist] },
  ];
  const q = clamp(p, 0, 1);
  const seg = q < 0.5 ? 0 : 1;
  const u = smooth(seg ? (q - 0.5) / 0.5 : q / 0.5);
  const a = keys[seg];
  const b = keys[seg + 1];
  const look = a.look.map((v, k) => lerp(v, b.look[k], u));
  const off = a.off.map((v, k) => lerp(v, b.off[k], u));
  return { look, pos: look.map((v, k) => v + off[k]) };
}
```

- [ ] **Step 5: 確認通過**

Run: 〈Node 測試(全部)〉。Expected: `# pass 24`、`# fail 0`(intro 5 + text 4 + layout 15)。

- [ ] **Step 6: CI** — `.github/workflows/test.yml`:`paths` 加 `assets/shares3d/**`;node job 那行改成跑〈Node 測試(全部)〉那個指令。

- [ ] **Step 7: Commit**

```bash
git add assets/shares3d/layout.js tools/shares3d/layout.test.mjs tools/scene3d/resolve.mjs .github/workflows/test.yml
git commit -m "feat(shares3d): 桌上 / 週疊 / 抽屜分組 / 櫃子 / 鏡頭路徑的純函式與測試"
```

---

### Task 3: 路由、資料、保底清單、token 與介面文字

**Files:**
- Create: `_layouts/shares.html`、`shares-3d.md`、`assets/shares3d/shares3d.css`
- Modify: `_includes/head.html`、`assets/css/tokens.css`、`_data/i18n.yml`

**Interfaces:**
- Produces:頁面 `/shares-3d/`;DOM:`#sh3d`(`.sh3d.s3d`)、`#sh3d-list`(保底清單)、`#sh3d-stage`(捲動長度,`hidden`)、
  `#sh3d-bar`(分組鍵,`hidden` + `.away`,按鈕 `[data-group-set="tag|source|month"]`)、`#sh3d-data`(JSON 陣列,每則
  `{ i: issue, t: 標題, u: 連結(失效且有封存時是封存版), s: 來源, d: 'YYYY-MM-DD', g: tags, n: 心得或 null, e: 摘要或 null, m: 圖片或 null, x: 失效 }`,新到舊)。
  token `--rule`、`--redline`、`--sticky`。i18n 鍵 `shares3d.group / by_tag / by_source / by_month / other / untagged / cards / week`。
  import map 期待 `assets/shares3d/{layout,scene,textures,main}.js`(Task 2、4、5)。

- [ ] **Step 1: head 支援 noindex** — `_includes/head.html` 的 `{% seo %}` 下一行加:

```liquid
{%- if page.noindex %}
<meta name="robots" content="noindex">
{%- endif %}
```

- [ ] **Step 2: token** — `assets/css/tokens.css`:
  - 晝(`--unlit:        oklch(0.14 0.012 var(--desk-h));` 下一行)加:
    ```css
      --rule:         oklch(0.86 0.035 240);
      --redline:      oklch(0.68 0.13 25);
      --sticky:       oklch(0.94 0.075 100);
    ```
  - 夜的兩個區塊(`@media (prefers-color-scheme: dark)` 裡與 `:root[data-theme="dark"]`)各在 `--unlit: oklch(0.05 0.004 var(--desk-h));` 那行之後加一行:
    ```css
        --rule: oklch(0.33 0.025 240); --redline: oklch(0.55 0.12 25); --sticky: oklch(0.72 0.08 100);
    ```
  - `@supports not (color: oklch(...))` 區塊的 `--accent: #874900; --unlit: #16181c; }` 改成:
    ```css
    --accent: #874900; --unlit: #16181c;
        --rule: #c9d6ea; --redline: #d9534f; --sticky: #f6eaa0; }
    ```

- [ ] **Step 3: 介面文字** — `_data/i18n.yml` 的 `books3d.nopages` 那行之後加(前面空一行):

```yaml
shares3d.group:     { zh: "分組", en: "Group by" }
shares3d.by_tag:    { zh: "依 tag", en: "By tag" }
shares3d.by_source: { zh: "依來源", en: "By source" }
shares3d.by_month:  { zh: "依月份", en: "By month" }
shares3d.other:     { zh: "其他來源", en: "Other sources" }
shares3d.untagged:  { zh: "未分類", en: "Untagged" }
shares3d.cards:     { zh: "{n} 張", en: "{n} cards", en_one: "{n} card" }
shares3d.week:      { zh: "{n} 那週", en: "Week of {n}" }
```

- [ ] **Step 4: 版面與頁面**

`_layouts/shares.html`:

```liquid
---
layout: default
shared: [anim.js, colors.js, text.js, glsl.js, geometry.js]
modules: [layout.js, scene.js, textures.js]
---
{%- assign v = site.time | date: '%s' -%}
<link rel="stylesheet" href="{{ '/assets/scene3d/scene3d.css' | relative_url }}?v={{ v }}">
<link rel="stylesheet" href="{{ '/assets/shares3d/shares3d.css' | relative_url }}?v={{ v }}">
<script type="importmap">{"imports": {
  "three": "{{ '/assets/vendor/three/three.module.min.js' | relative_url }}"
  {%- for m in layout.shared %},
  "scene3d/{{ m }}": "{{ '/assets/scene3d/' | append: m | relative_url }}?v={{ v }}"
  {%- endfor %}
  {%- for m in layout.modules %},
  "shares3d/{{ m }}": "{{ '/assets/shares3d/' | append: m | relative_url }}?v={{ v }}"
  {%- endfor %}
}}</script>
<link rel="modulepreload" href="{{ '/assets/vendor/three/three.module.min.js' | relative_url }}">
<link rel="modulepreload" href="{{ '/assets/shares3d/main.js' | relative_url }}?v={{ v }}">
{%- for m in layout.shared %}
<link rel="modulepreload" href="{{ '/assets/scene3d/' | append: m | relative_url }}?v={{ v }}">
{%- endfor %}
{%- for m in layout.modules %}
<link rel="modulepreload" href="{{ '/assets/shares3d/' | append: m | relative_url }}?v={{ v }}">
{%- endfor %}
<section class="sh3d s3d" id="sh3d">
  <h1 class="visually-hidden" data-i18n="nav.shares">{% include t.html k="nav.shares" %}</h1>
  <div class="shelf sh3d-list" id="sh3d-list" aria-label="分享的文章" data-i18n-attr="aria-label:shelf.label">
    {%- if site.posts.size == 0 %}
    <p class="empty" data-i18n="shelf.none">{% include t.html k="shelf.none" %}</p>
    {%- else %}
    <div class="grid">
      {%- for p in site.posts %}
      {% include share-card.html post=p %}
      {%- endfor %}
    </div>
    {%- endif %}
  </div>
  <div class="sh3d-stage" id="sh3d-stage" hidden></div>
  <div class="sh3d-bar away" id="sh3d-bar" hidden>
    <div class="sh3d-keys" role="group" aria-label="分組" data-i18n-attr="aria-label:shares3d.group">
      <button type="button" class="key" data-group-set="tag" aria-pressed="false" data-i18n="shares3d.by_tag">{% include t.html k="shares3d.by_tag" %}</button>
      <button type="button" class="key" data-group-set="source" aria-pressed="false" data-i18n="shares3d.by_source">{% include t.html k="shares3d.by_source" %}</button>
      <button type="button" class="key" data-group-set="month" aria-pressed="false" data-i18n="shares3d.by_month">{% include t.html k="shares3d.by_month" %}</button>
    </div>
  </div>
</section>
{%- capture shares_json -%}
[{%- for p in site.posts -%}
  {%- capture lc_key -%}{{ p.issue }}{%- endcapture -%}
  {%- assign lc = site.data.linkcheck[lc_key] -%}
  {%- assign dead = false -%}
  {%- if site.modules.archive and lc.dead and p.archive -%}{%- assign dead = true -%}{%- endif -%}
  {%- assign href = p.link -%}
  {%- if dead -%}{%- assign href = p.archive -%}{%- endif -%}
  {%- unless forloop.first %},{% endunless -%}
  {"i":{{ p.issue | default: 0 | jsonify }},"t":{{ p.title | jsonify }},"u":{{ href | jsonify }},"s":{{ p.source | jsonify }},
  "d":{{ p.date | date: '%Y-%m-%d' | jsonify }},"g":{{ p.tags | jsonify }},"n":{{ p.note | jsonify }},"e":{{ p.description | jsonify }},
  "m":{{ p.image | jsonify }},"x":{{ dead }}}
{%- endfor -%}]
{%- endcapture %}
<script type="application/json" id="sh3d-data">{{ shares_json | replace: "</", "<\/" }}</script>
<script>
addEventListener('error', (e) => {
  const root = document.getElementById('sh3d');
  if (/\/assets\/(shares3d|scene3d|vendor\/three)\//.test(e.target.src || e.filename || '') && !root.classList.contains('on')) root.classList.add('fail');
}, true);
</script>
<script type="module" src="{{ '/assets/shares3d/main.js' | relative_url }}?v={{ v }}"></script>
```

`shares-3d.md`:

```yaml
---
layout: shares
title: 分享
title_key: nav.shares
permalink: /shares-3d/
sitemap: false
noindex: true
---
```

`assets/shares3d/shares3d.css`:

```css
.sh3d-canvas { position: fixed; top: 0; left: 0; right: 0; width: 100%; height: 100vh; height: 100lvh; z-index: -1; display: block; }
.sh3d.on .sh3d-list { position: fixed; inset: 0; overflow: hidden; clip-path: inset(50%); pointer-events: none; white-space: nowrap; }
html.js .sh3d:not(.on):not(.fail) .sh3d-list { visibility: hidden; }
.sh3d-stage { height: 340vh; height: 340lvh; }
.main:has(> .sh3d.on) { padding-bottom: 0; }
.sh3d-bar { position: fixed; left: 0; right: 0; bottom: calc(env(safe-area-inset-bottom, 0px) + 1.25rem); z-index: 20;
  display: flex; justify-content: center; pointer-events: none; transition: opacity 250ms, visibility 250ms; }
.sh3d-bar.away, .sh3d.on:not(.lit) .sh3d-bar { opacity: 0; visibility: hidden; }
.sh3d-keys { display: flex; gap: 0.4rem; pointer-events: auto; }
@media (prefers-reduced-motion: reduce) { .sh3d-bar { transition: none; } }
```

- [ ] **Step 5: 建置與 htmlproofer**

Run: 〈建置〉與〈建置後檢查〉。Expected: 都通過。

- [ ] **Step 6: 檢查輸出**

```bash
python3 - <<'EOF'
import json, re
s = open('_site/shares-3d/index.html').read()
raw = re.search(r'<script type="application/json" id="sh3d-data">(.*?)</script>', s, re.S).group(1)
data = json.loads(raw)
print(len(data), sorted(data[0].keys()))
assert all(isinstance(x['g'], list) and re.fullmatch(r'\d{4}-\d{2}-\d{2}', x['d']) and isinstance(x['x'], bool) for x in data)
assert [x['d'] for x in data] == sorted([x['d'] for x in data], reverse=True)
json.loads(re.search(r'<script type="importmap">(.*?)</script>', s, re.S).group(1))
assert '<meta name="robots" content="noindex">' in s
assert 'shares-3d' not in open('_site/sitemap.xml').read()
assert 'noindex' not in open('_site/index.html').read()
assert s.count('class="share"') == len(data) or s.count('<article class="share"') == len(data)
print('ok')
EOF
rtk proxy grep -c 'rel="modulepreload"' _site/shares-3d/index.html
```

Expected: 印出則數與鍵 `['d', 'e', 'g', 'i', 'm', 'n', 's', 't', 'u', 'x']`、`ok`;modulepreload `10`。
(這時 `main.js` 還不存在,瀏覽器開這頁會因為 404 加上 `.fail` 而顯示保底清單,這正是保底情境。)

- [ ] **Step 7: Commit**

```bash
git add _layouts/shares.html shares-3d.md assets/shares3d/shares3d.css _includes/head.html assets/css/tokens.css _data/i18n.yml
git commit -m "feat(shares3d): /shares-3d/ 路由、資料 JSON、保底清單、索引卡 token 與介面文字"
```

---

### Task 4: 卡片貼圖池與 three.js 場景

**Files:**
- Create: `assets/shares3d/textures.js`、`assets/shares3d/scene.js`

**Interfaces:**
- Consumes: `scene3d/text.js` 的 `wrap, clampLines`;`scene3d/glsl.js` 的 `LIGHT, REVEAL, SKETCH`;`scene3d/geometry.js` 的 `box`;
  `shares3d/layout.js` 的 `CARD, DRAWER, FOV, mainName`。
- Produces:
  - `textures.js`:`loadFonts(items) → Promise`(最多等 3 秒);
    `createAtlas(gl, items, onDrawn) → { texture, tile(i) → [u,v,du,dv] | null, want(ids), pump() → boolean, reset(), pending() → boolean }`
    (`gl` 只用到 `gl.renderer`;卡片正面畫成遮罩:R 標題、G 來源 / 日期 / tag、B 印章);
    `createLabels(onTexture) → { draw(drawers: [{name, count}], piles: string[]), drawerTile(k), pileTile(k), restore() }`(每次 `draw` 產生新貼圖並呼叫 `onTexture(tex)`;遮罩 R 名稱 / 週疊文字、G 張數與標籤框)。
  - `scene.js`:`createScene(n) → { renderer, canvas, setCards(list), setShadows(list), setCabinet(cab), setDrawers(list), setPileLabels(list), setTextures(cardsTex|null, labelsTex|null), setColors(tokens), setLamp(on, x, y, z, reach), deskPoint(x, y) → [x,y,z]|null, resize(w, h), render({pos, look}), warm() → Promise }`。
    - `setCards` 每項:`{ x, y, z, rx, ry, tile: [4]|null, stamp: [r,g,b], tab: { x, color: [r,g,b] }, sticky: boolean }`。
    - `setShadows` 每項:`{ x, z, ry, w, h }`(最多 40)。`setDrawers` 每項:`{ x, y, z, tile: [4] }`。`setPileLabels` 每項:`{ x, z, tile: [4] }`(最多 12)。
    - `setColors(tokens)`:`tokens` 是 `scene3d/colors.js` `readTokens` 的結果,需要 `desk, face, paper, paper-deep, edge, edge-n, edge-n-deep, ink, ink-3, rule, redline, sticky, drop-near`。

- [ ] **Step 1: `assets/shares3d/textures.js`**

```js
import * as THREE from 'three';
import { wrap, clampLines } from 'scene3d/text.js';
import { mainName } from 'shares3d/layout.js';

const CW = 320;
const CH = 192;
const PAD = 2;
const PITCH_X = CW + 2 * PAD;
const PITCH_Y = CH + 2 * PAD;
const PER_FRAME = 6;
const MAX_TILES = 120;
const MIP_EVERY = 500;
const LW = 256;
const LH = 128;
const LCOLS = 8;
const PW = 512;
const PH = 64;
const PCOLS = 4;
const PROWS = 3;

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const QUAD_FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0);
}
`;

function cssFont(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function loadFonts(items) {
  const sample = items.map((it) => it.t).join('') + 'AaBb0123…';
  const all = Promise.all([
    document.fonts.load(`600 16px ${cssFont('--font-display', 'serif')}`, sample),
    document.fonts.load(`400 16px ${cssFont('--font-code', 'monospace')}`, 'Aa0123.-·'),
    document.fonts.load(`700 16px ${cssFont('--font-ui', 'sans-serif')}`, 'AaBb中文分類'),
  ]).catch(() => {});
  return Promise.race([all, new Promise((r) => setTimeout(r, 3000))]);
}

function drawCard(g, it) {
  const k = CW / 640;
  const display = cssFont('--font-display', 'serif');
  const code = cssFont('--font-code', 'monospace');
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#000';
  g.fillRect(0, 0, CW, CH);
  g.globalCompositeOperation = 'lighter';
  g.textBaseline = 'top';
  g.textAlign = 'left';
  g.fillStyle = '#0f0';
  g.font = `400 ${21 * k}px ${code}`;
  g.fillText(it.s, 28 * k, 36 * k);
  g.textAlign = 'right';
  g.fillText(it.d, CW - 28 * k, 36 * k);
  g.textAlign = 'left';
  g.fillStyle = '#f00';
  g.font = `600 ${29 * k}px ${display}`;
  clampLines(g, wrap(g, it.t, 350 * k), 5, 350 * k).forEach((l, n) => g.fillText(l, 28 * k, (125 + 38 * n) * k));
  g.fillStyle = '#0f0';
  g.font = `400 ${19 * k}px ${code}`;
  g.textBaseline = 'alphabetic';
  g.fillText(it.g.join(' · '), 28 * k, CH - 24 * k);
  const name = mainName(it.s);
  g.save();
  g.translate(500 * k, 214 * k);
  g.rotate(-0.14);
  g.strokeStyle = '#00f';
  g.fillStyle = '#00f';
  g.lineWidth = 5 * k;
  g.beginPath();
  g.arc(0, 0, 71.5 * k, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2 * k;
  g.beginPath();
  g.arc(0, 0, 63 * k, 0, Math.PI * 2);
  g.stroke();
  g.textAlign = 'center';
  g.font = `600 ${64 * k}px ${display}`;
  g.fillText(Array.from(name)[0].toUpperCase(), 0, 14 * k);
  g.font = `400 ${15 * k}px ${code}`;
  g.fillText(name.slice(0, 10).toUpperCase(), 0, 40 * k);
  g.restore();
  g.globalCompositeOperation = 'source-over';
}

export function createAtlas(gl, items, onDrawn) {
  const renderer = gl.renderer;
  const max = Math.min(renderer.capabilities.maxTextureSize, 4096);
  const cols = Math.max(1, Math.floor(max / PITCH_X));
  const cap = Math.max(1, Math.min(items.length, MAX_TILES, cols * Math.floor(max / PITCH_Y)));
  const rows = Math.ceil(cap / cols);
  const rt = new THREE.WebGLRenderTarget(cols * PITCH_X, rows * PITCH_Y, {
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });

  function clear() {
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.setRenderTarget(null);
  }
  clear();
  rt.texture.generateMipmaps = false;

  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(0, rt.width, rt.height, 0, -1, 1);
  const quadGeo = new THREE.PlaneGeometry(CW, CH);
  const quadMat = () => new THREE.ShaderMaterial({ uniforms: { map: { value: null } }, vertexShader: QUAD_VERT, fragmentShader: QUAD_FRAG, depthTest: false, depthWrite: false });
  const canvases = Array.from({ length: PER_FRAME }, () => {
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = CH;
    return c;
  });

  const slotOf = new Map();
  const itemOf = new Array(cap).fill(-1);
  const used = new Float64Array(cap);
  const ready = new Uint8Array(cap);
  const queue = [];
  let clock = 0;
  let lastMip = 0;
  let quadReady = false;

  const probe = new THREE.Mesh(quadGeo, quadMat());
  quadScene.add(probe);
  renderer.compileAsync(quadScene, quadCam).then(() => {
    quadScene.remove(probe);
    probe.material.dispose();
    quadReady = true;
    onDrawn();
  });

  function cell(s) {
    return { x: (s % cols) * PITCH_X + PAD, y: Math.floor(s / cols) * PITCH_Y + PAD };
  }

  function tile(i) {
    const s = slotOf.get(i);
    if (s === undefined || !ready[s]) return null;
    const c = cell(s);
    return [(c.x + 0.5) / rt.width, (c.y + 0.5) / rt.height, (CW - 1) / rt.width, (CH - 1) / rt.height];
  }

  function want(ids) {
    clock++;
    const keep = new Set(ids);
    ids.forEach((i) => {
      if (slotOf.has(i)) {
        used[slotOf.get(i)] = clock;
        return;
      }
      let s = itemOf.indexOf(-1);
      if (s < 0) {
        for (let k = 0; k < cap; k++) if (!keep.has(itemOf[k]) && (s < 0 || used[k] < used[s])) s = k;
        if (s < 0) return;
        slotOf.delete(itemOf[s]);
      }
      itemOf[s] = i;
      slotOf.set(i, s);
      used[s] = clock;
      ready[s] = 0;
      queue.push(s);
    });
  }

  function pump() {
    if (!queue.length || !quadReady) return false;
    const batch = [...new Set(queue.splice(0, PER_FRAME))].filter((s) => itemOf[s] >= 0 && !ready[s]);
    const meshes = batch.map((s, k) => {
      const c = canvases[k];
      drawCard(c.getContext('2d'), items[itemOf[s]]);
      const tex = new THREE.CanvasTexture(c);
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      const mat = quadMat();
      mat.uniforms.map.value = tex;
      const mesh = new THREE.Mesh(quadGeo, mat);
      const p = cell(s);
      mesh.position.set(p.x + CW / 2, p.y + CH / 2, 0);
      quadScene.add(mesh);
      return mesh;
    });
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    const now = performance.now();
    rt.texture.generateMipmaps = !queue.length || now - lastMip > MIP_EVERY;
    if (rt.texture.generateMipmaps) lastMip = now;
    renderer.setRenderTarget(rt);
    renderer.render(quadScene, quadCam);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAuto;
    meshes.forEach((mesh) => {
      quadScene.remove(mesh);
      mesh.material.uniforms.map.value.dispose();
      mesh.material.dispose();
    });
    batch.forEach((s) => { ready[s] = 1; });
    onDrawn();
    return true;
  }

  function reset() {
    clear();
    ready.fill(0);
    queue.length = 0;
    itemOf.forEach((i, s) => { if (i >= 0) queue.push(s); });
  }

  return { texture: rt.texture, tile, want, pump, reset, pending: () => queue.length > 0 };
}

export function createLabels(onTexture) {
  let texture = null;
  let height = 1;
  let drawerRows = 1;

  function draw(drawers, piles) {
    const ui = cssFont('--font-ui', 'sans-serif');
    const code = cssFont('--font-code', 'monospace');
    drawerRows = Math.max(1, Math.ceil(drawers.length / LCOLS));
    height = drawerRows * LH + PROWS * PH;
    const canvas = document.createElement('canvas');
    canvas.width = LCOLS * LW;
    canvas.height = height;
    const g = canvas.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = 'lighter';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    drawers.forEach(({ name, count }, k) => {
      const x = (k % LCOLS) * LW;
      const y = Math.floor(k / LCOLS) * LH;
      g.strokeStyle = '#0f0';
      g.lineWidth = 4;
      g.strokeRect(x + 46, y + 16, 164, 54);
      let fs = 28;
      g.font = `700 ${fs}px ${ui}`;
      while (g.measureText(name).width > 148 && fs > 12) {
        fs -= 1;
        g.font = `700 ${fs}px ${ui}`;
      }
      g.fillStyle = '#f00';
      g.fillText(name, x + LW / 2, y + 44);
      g.fillStyle = '#0f0';
      g.font = `400 20px ${code}`;
      g.fillText(count, x + LW / 2, y + 96);
    });
    piles.forEach((text, k) => {
      const x = (k % PCOLS) * PW;
      const y = drawerRows * LH + Math.floor(k / PCOLS) * PH;
      g.fillStyle = '#f00';
      g.font = `400 30px ${code}`;
      g.fillText(text, x + PW / 2, y + PH / 2);
    });
    const old = texture;
    texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    onTexture(texture);
    if (old) old.dispose();
  }

  function rect(x, y, w, h) {
    return [x / (LCOLS * LW), 1 - (y + h) / height, w / (LCOLS * LW), h / height];
  }

  return {
    draw,
    drawerTile: (k) => rect((k % LCOLS) * LW, Math.floor(k / LCOLS) * LH, LW, LH),
    pileTile: (k) => rect((k % PCOLS) * PW, drawerRows * LH + Math.floor(k / PCOLS) * PH, PW, PH),
    restore: () => { if (texture) texture.needsUpdate = true; },
  };
}
```

- [ ] **Step 2: `assets/shares3d/scene.js`**

```js
import * as THREE from 'three';
import { LIGHT, REVEAL, SKETCH } from 'scene3d/glsl.js';
import { box } from 'scene3d/geometry.js';
import { CARD, DRAWER, FOV } from 'shares3d/layout.js';

const TAB = { W: 28, H: 9 };
const STICKY = 30;
const HANDLE = { W: 32, H: 6, D: 6, DROP: 22 };
const LABEL = { W: 140, H: 17.5 };
const SHADOW = 9;

const FINISH = 'gl_FragColor = vec4(mix(mix(sketch(lit(c, vN), vN, vUv), uDesk, uDim), uUnlit.rgb, uUnlit.a), 1.0);';

const INST_VERT = /* glsl */ `
attribute float face;
attribute vec4 iTile;
attribute vec3 iColor;
varying vec4 vTile;
varying vec3 vColor;
varying vec3 vN;
varying vec2 vUv;
varying float vFace;
varying vec3 vWorld;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = mat3(m) * normal;
  vUv = uv;
  vFace = face;
  vTile = iTile;
  vColor = iColor;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const INST_HEAD = /* glsl */ `
uniform vec3 uDesk;
uniform float uDim;
uniform vec4 uUnlit;
varying vec4 vTile;
varying vec3 vColor;
varying vec3 vN;
varying vec2 vUv;
varying float vFace;
${LIGHT}
${SKETCH}
`;

const CARD_FRAG = /* glsl */ `
uniform sampler2D uCards;
uniform vec3 uFace;
uniform vec3 uPaper;
uniform vec3 uPaperDeep;
uniform vec3 uInk3;
uniform vec3 uRule;
uniform vec3 uRedline;
${INST_HEAD}
float hairline(float d, float w, float aa) {
  return 1.0 - smoothstep(w, w + aa, d);
}
void main() {
  int f = int(vFace + 0.5);
  float ty = (1.0 - vUv.y) * ${CARD.H.toFixed(2)};
  float aa = fwidth(ty);
  vec3 m = texture2D(uCards, vTile.xy + vUv * vTile.zw).rgb * step(0.0001, vTile.z);
  float rule = hairline(abs(mod(ty - 30.88 + 3.76, 7.52) - 3.76), 0.18, aa) * step(29.0, ty) * step(ty, 74.5);
  float red = hairline(abs(ty - 15.83), 0.3, aa);
  vec3 c = uPaperDeep;
  if (f == 4) {
    c = mix(uFace, uRule, rule);
    c = mix(c, uRedline, red);
    c = mix(c, uInk, m.r);
    c = mix(c, uInk3, m.g);
    c = mix(c, vColor, m.b * 0.85);
  } else if (f == 5) {
    c = uPaper;
  }
  ${FINISH}
}
`;

const SOLID_FRAG = /* glsl */ `
${INST_HEAD}
void main() {
  vec3 c = vColor;
  ${FINISH}
}
`;

const DRAWER_FRAG = /* glsl */ `
uniform sampler2D uLabels;
uniform vec3 uFace;
uniform vec3 uInk3;
uniform vec3 uEdgeNDeep;
${INST_HEAD}
void main() {
  int f = int(vFace + 0.5);
  vec3 m = texture2D(uLabels, vTile.xy + vUv * vTile.zw).rgb * step(0.0001, vTile.z);
  vec3 c = uEdgeNDeep;
  if (f == 4) {
    c = mix(uFace, uInk, m.r);
    c = mix(c, uInk3, m.g);
  }
  ${FINISH}
}
`;

const DESK_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const DESK_FRAG = /* glsl */ `
uniform vec3 uDesk;
uniform vec4 uUnlit;
${LIGHT}
void main() {
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 day = vec3(uAmbient + uKey * max(dot(n, uLight), 0.0));
  vec3 c = lit(uDesk, n) / day;
  gl_FragColor = vec4(mix(c, uUnlit.rgb, uUnlit.a), 1.0);
}
`;

const FLAT_VERT = /* glsl */ `
attribute vec4 iTile;
attribute vec2 iInner;
varying vec4 vTile;
varying vec2 vInner;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vUv = uv;
  vTile = iTile;
  vInner = iInner;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SHADOW_FRAG = /* glsl */ `
uniform vec4 uDrop;
uniform float uDim;
uniform vec4 uUnlit;
varying vec2 vInner;
varying vec2 vUv;
${REVEAL}
void main() {
  vec2 q = max(abs(vUv * 2.0 - 1.0) - vInner, 0.0) / max(1.0 - vInner, vec2(0.001));
  float a = 1.0 - smoothstep(0.0, 1.0, length(q));
  gl_FragColor = vec4(mix(uDrop.rgb, uUnlit.rgb, uUnlit.a), uDrop.a * a * a * (1.0 - uDim) * (1.0 - sketchAmount()));
}
`;

const LABEL_FRAG = /* glsl */ `
uniform sampler2D uLabels;
uniform vec3 uInk3;
uniform vec4 uUnlit;
varying vec4 vTile;
varying vec2 vUv;
${LIGHT}
${REVEAL}
void main() {
  float a = texture2D(uLabels, vTile.xy + vUv * vTile.zw).r;
  vec3 c = lit(uInk3, vec3(0.0, 1.0, 0.0));
  gl_FragColor = vec4(mix(c, uUnlit.rgb, uUnlit.a), a * 0.9 * (1.0 - sketchAmount()));
}
`;

export function createScene(n) {
  THREE.ColorManagement.enabled = false;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 8000);

  const common = {
    uLight: { value: new THREE.Vector3(-0.25, 0.85, 0.45).normalize() },
    uAmbient: { value: 0.62 },
    uKey: { value: 0.42 },
    uLamp: { value: new THREE.Vector4(0, 0, 0, 0) },
    uLampColor: { value: new THREE.Color(1, 0.85, 0.6) },
    uLampReach: { value: 380 },
  };
  const colors = {
    uDesk: { value: new THREE.Color() },
    uFace: { value: new THREE.Color() },
    uPaper: { value: new THREE.Color() },
    uPaperDeep: { value: new THREE.Color() },
    uInk: { value: new THREE.Color() },
    uInk3: { value: new THREE.Color() },
    uRule: { value: new THREE.Color() },
    uRedline: { value: new THREE.Color() },
    uEdgeNDeep: { value: new THREE.Color() },
    uDrop: { value: new THREE.Vector4() },
    uDim: { value: 0 },
    uUnlit: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSketch: { value: new THREE.Vector4(0, 0, 1, 9) },
    uCards: { value: null },
    uLabels: { value: null },
  };
  const uniforms = Object.assign({}, common, colors);
  const material = (vertexShader, fragmentShader, extra = {}) => new THREE.ShaderMaterial(Object.assign({ uniforms, vertexShader, fragmentShader }, extra));

  function instanced(geo, mat, max, attrs) {
    Object.entries(attrs).forEach(([name, size]) => geo.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(max * size), size)));
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    return mesh;
  }
  const solidAttrs = { iTile: 4, iColor: 3 };
  const flatGeo = (w, h) => new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2);

  const desk = new THREE.Mesh(flatGeo(8000, 8000), material(DESK_VERT, DESK_FRAG));
  desk.position.z = -1000;
  scene.add(desk);

  const maxDrawers = n + 32;
  const shadows = instanced(flatGeo(1, 1), material(FLAT_VERT, SHADOW_FRAG, { transparent: true, depthWrite: false }), 40, { iTile: 4, iInner: 2 });
  const labels = instanced(flatGeo(LABEL.W, LABEL.H), material(FLAT_VERT, LABEL_FRAG, { transparent: true, depthWrite: false }), 12, { iTile: 4, iInner: 2 });
  const cards = instanced(box(-CARD.W / 2, CARD.W / 2, -CARD.H / 2, CARD.H / 2, -CARD.T / 2, CARD.T / 2), material(INST_VERT, CARD_FRAG), n, solidAttrs);
  const solidMat = material(INST_VERT, SOLID_FRAG);
  const tabs = instanced(box(-TAB.W / 2, TAB.W / 2, -1, TAB.H, -CARD.T / 2, CARD.T / 2), solidMat, n, solidAttrs);
  const stickies = instanced(box(-STICKY / 2, STICKY / 2, -STICKY / 2, STICKY / 2, 0, 0.3), solidMat, n, solidAttrs);
  const body = instanced(box(-0.5, 0.5, 0, 1, -0.5, 0.5), solidMat, 1, solidAttrs);
  const fronts = instanced(box(-DRAWER.W / 2, DRAWER.W / 2, -DRAWER.H / 2, DRAWER.H / 2, 0, DRAWER.D), material(INST_VERT, DRAWER_FRAG), maxDrawers, solidAttrs);
  const handles = instanced(box(-HANDLE.W / 2, HANDLE.W / 2, -HANDLE.H / 2, HANDLE.H / 2, 0, HANDLE.D), solidMat, maxDrawers, solidAttrs);

  const _m = new THREE.Matrix4();
  const _a = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3(1, 1, 1);
  const tint = { sticky: [1, 1, 0.6], body: [0.5, 0.5, 0.5], handle: [0.4, 0.4, 0.4] };

  function pose(m, x, y, z, rx, ry, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, 0, 'YXZ');
    _q.setFromEuler(_e);
    return m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  }
  function touch(mesh, ...names) {
    mesh.instanceMatrix.needsUpdate = true;
    names.forEach((k) => { mesh.geometry.attributes[k].needsUpdate = true; });
  }
  function paint(mesh, count, rgb) {
    const a = mesh.geometry.attributes.iColor;
    for (let k = 0; k < count; k++) a.setXYZ(k, rgb[0], rgb[1], rgb[2]);
    a.needsUpdate = true;
  }

  function setCards(list) {
    const tile = cards.geometry.attributes.iTile;
    const stamp = cards.geometry.attributes.iColor;
    const tabColor = tabs.geometry.attributes.iColor;
    let ns = 0;
    cards.count = tabs.count = list.length;
    list.forEach((c, k) => {
      pose(_m, c.x, c.y, c.z, c.rx, c.ry);
      cards.setMatrixAt(k, _m);
      const t = c.tile || [0, 0, 0, 0];
      tile.setXYZW(k, t[0], t[1], t[2], t[3]);
      stamp.setXYZ(k, c.stamp[0], c.stamp[1], c.stamp[2]);
      _a.makeTranslation(c.tab.x, CARD.H / 2, 0);
      tabs.setMatrixAt(k, _a.premultiply(_m));
      tabColor.setXYZ(k, c.tab.color[0], c.tab.color[1], c.tab.color[2]);
      if (c.sticky) {
        _a.makeRotationZ(0.12).setPosition(CARD.W / 2 - 18, -CARD.H / 2 + 18, CARD.T / 2 + 0.05);
        stickies.setMatrixAt(ns++, _a.premultiply(_m));
      }
    });
    stickies.count = ns;
    paint(stickies, ns, tint.sticky);
    touch(cards, 'iTile', 'iColor');
    touch(tabs, 'iColor');
    touch(stickies);
  }

  function setShadows(list) {
    const inner = shadows.geometry.attributes.iInner;
    shadows.count = Math.min(list.length, 40);
    for (let k = 0; k < shadows.count; k++) {
      const s = list[k];
      pose(_m, s.x, 0.06, s.z + 2, 0, s.ry, s.w + 2 * SHADOW, 1, s.h + 2 * SHADOW);
      shadows.setMatrixAt(k, _m);
      inner.setXY(k, (s.w - 6) / (s.w + 2 * SHADOW), (s.h - 6) / (s.h + 2 * SHADOW));
    }
    touch(shadows, 'iInner');
  }

  function setCabinet(cab) {
    pose(_m, 0, 0, cab.z - cab.depth / 2, 0, 0, cab.width, cab.height, cab.depth);
    body.setMatrixAt(0, _m);
    body.count = 1;
    paint(body, 1, tint.body);
    touch(body);
  }

  function setDrawers(list) {
    const tile = fronts.geometry.attributes.iTile;
    fronts.count = handles.count = Math.min(list.length, maxDrawers);
    for (let k = 0; k < fronts.count; k++) {
      const d = list[k];
      pose(_m, d.x, d.y, d.z, 0, 0);
      fronts.setMatrixAt(k, _m);
      tile.setXYZW(k, d.tile[0], d.tile[1], d.tile[2], d.tile[3]);
      pose(_m, d.x, d.y - HANDLE.DROP, d.z + DRAWER.D, 0, 0);
      handles.setMatrixAt(k, _m);
    }
    paint(handles, handles.count, tint.handle);
    touch(fronts, 'iTile');
    touch(handles);
  }

  function setPileLabels(list) {
    const tile = labels.geometry.attributes.iTile;
    labels.count = Math.min(list.length, 12);
    for (let k = 0; k < labels.count; k++) {
      const l = list[k];
      pose(_m, l.x, 0.07, l.z, 0, 0);
      labels.setMatrixAt(k, _m);
      tile.setXYZW(k, l.tile[0], l.tile[1], l.tile[2], l.tile[3]);
    }
    touch(labels, 'iTile');
  }

  function setTextures(cardsTex, labelsTex) {
    if (cardsTex) colors.uCards.value = cardsTex;
    if (labelsTex) colors.uLabels.value = labelsTex;
  }

  const clear = new THREE.Color();
  function setColors(t) {
    const set = (name, v) => colors[name].value.setRGB(v[0], v[1], v[2]);
    set('uDesk', t.desk);
    set('uFace', t.face);
    set('uPaper', t.paper);
    set('uPaperDeep', t['paper-deep']);
    set('uInk', t.ink);
    set('uInk3', t['ink-3']);
    set('uRule', t.rule);
    set('uRedline', t.redline);
    set('uEdgeNDeep', t['edge-n-deep']);
    colors.uDrop.value.set(t['drop-near'][0], t['drop-near'][1], t['drop-near'][2], t['drop-near'][3]);
    tint.sticky = t.sticky.slice(0, 3);
    tint.body = t['edge-n'].slice(0, 3);
    tint.handle = t['edge-n-deep'].slice(0, 3);
    paint(body, body.count, tint.body);
    paint(handles, handles.count, tint.handle);
    paint(stickies, stickies.count, tint.sticky);
    common.uLampColor.value.setRGB(t.edge[0], t.edge[1], t.edge[2]).lerp(new THREE.Color(1, 1, 1), 0.45);
    renderer.setClearColor(clear.setRGB(t.desk[0], t.desk[1], t.desk[2]), 1);
  }

  function setLamp(on, x = 0, y = 0, z = 0, reach = 380) {
    common.uLamp.value.set(x, y, z, on ? 1 : 0);
    common.uLampReach.value = reach;
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  function deskPoint(x, y) {
    ndc.set((x / canvas.clientWidth) * 2 - 1, 1 - (y / canvas.clientHeight) * 2);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(floor, hit) ? [hit.x, hit.y, hit.z] : null;
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function render(cam) {
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    camera.lookAt(cam.look[0], cam.look[1], cam.look[2]);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
  }

  function warm() {
    return renderer.compileAsync(scene, camera);
  }

  return { renderer, canvas, setCards, setShadows, setCabinet, setDrawers, setPileLabels, setTextures, setColors, setLamp, deskPoint, resize, render, warm };
}
```

- [ ] **Step 3: shader 逐項檢查**(沒有瀏覽器能自動編譯,逐項人工確認並把結果寫進報告)

1. 每個 fragment shader 用到的 uniform 都有宣告且只宣告一次:`uInk` 只由 `SKETCH` 宣告(`CARD_FRAG`、`DRAWER_FRAG` 不另外宣告);`uDesk` 在 `INST_HEAD` 裡、位於 `${SKETCH}` 之前;`LABEL_FRAG` 與 `DESK_FRAG` 沒有用 `SKETCH`。
2. 用到 `LIGHT` 的 shader(`INST_HEAD`、`DESK_FRAG`、`LABEL_FRAG`)對應的 vertex shader 都宣告並寫入 `varying vec3 vWorld`。
3. `texture2D` 與 `fwidth` 都在 `if` 之外(一致的控制流程)。
4. `colors` 物件裡的每個 uniform 名稱在 shader 裡拼法相同(`uEdgeNDeep`、`uInk3`、`uRedline`…)。
5. `${CARD.H.toFixed(2)}` 產生的是浮點常數(`76.00`)。

Run: `node --check assets/shares3d/textures.js && node --check assets/shares3d/scene.js && echo OK` → `OK`。

- [ ] **Step 4: Commit**

```bash
git add assets/shares3d/textures.js assets/shares3d/scene.js
git commit -m "feat(shares3d): 卡片正面遮罩貼圖池、抽屜標籤與 three.js 場景(instanced 卡片 / 色標 / 便利貼 / 抽屜)"
```

---

### Task 5: 接起來:捲動鏡頭、主題、語言、分組切換、夜間檯燈

**Files:**
- Create: `assets/shares3d/main.js`

**Interfaces:**
- Consumes: Task 2 的 layout 函式、Task 3 的 DOM 與 JSON、Task 4 的 `createScene`、`createAtlas`、`createLabels`、`loadFonts`;
  `scene3d/colors.js` 的 `readTokens, rgba, watchTheme`;`scene3d/anim.js` 的 `ease, clamp, approach`。
- Produces:可以逛的 `/shares-3d/`。localStorage `shares3d-group` 記住分組。

- [ ] **Step 1: `assets/shares3d/main.js`**

```js
import { readTokens, rgba, watchTheme } from 'scene3d/colors.js';
import { ease, clamp, approach } from 'scene3d/anim.js';
import { CARD, CAB, taipeiToday, pickDesk, groups, cabinet, deskPose, pilePose, pileLabelPose, cameraAt, mainName, hueOf, tabSlot } from 'shares3d/layout.js';
import { createScene } from 'shares3d/scene.js';
import { createAtlas, createLabels, loadFonts } from 'shares3d/textures.js';

const root = document.getElementById('sh3d');
const stage = document.getElementById('sh3d-stage');
const bar = document.getElementById('sh3d-bar');
const items = JSON.parse(document.getElementById('sh3d-data').textContent);
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const GROUP_KEY = 'shares3d-group';
const MODES = ['tag', 'source', 'month'];
const TOKENS = ['desk', 'face', 'paper', 'paper-deep', 'edge', 'edge-n', 'edge-n-deep', 'ink', 'ink-3', 'rule', 'redline', 'sticky', 'drop-near'];
const CABINET_AT = 0.74;
const SLIDE = 380;
const STAGGER = 45;

const t = (k, n) => (window.siteI18n ? window.siteI18n.t(k, n) : k);
const lang = () => (document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'zh');
const md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const gap = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

function monthName(key) {
  const [y, m] = key.split('-').map(Number);
  if (lang() === 'zh') return `${y} 年 ${m} 月`;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function drawerName(d) {
  const name = d.kind === 'other' ? t('shares3d.other') : d.kind === 'untagged' ? t('shares3d.untagged') : d.kind === 'month' ? monthName(d.key) : d.key;
  return d.parts > 1 ? `${name} · ${d.part}` : name;
}

function start() {
  if (!items.length) {
    root.classList.add('fail');
    return;
  }
  let gl;
  try {
    gl = createScene(items.length);
  } catch (e) {
    root.classList.add('fail');
    return;
  }
  const canvas = gl.canvas;
  canvas.className = 'sh3d-canvas s3d-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  root.appendChild(canvas);
  root.classList.add('on', 'soft');
  stage.hidden = false;
  bar.hidden = false;

  let mode = 'tag';
  try {
    const m = localStorage.getItem(GROUP_KEY);
    if (MODES.includes(m)) mode = m;
  } catch (e) {}
  const { desk, piles } = pickDesk(items, taipeiToday(Date.now()));
  let drawers = groups(items, mode);
  let cab = cabinet(drawers.length);
  let slide = null;
  let dark = false;
  let raf = 0;
  let last = 0;
  let ready = false;
  const cam = { pos: null, look: null };
  const pointer = { x: 0, y: 0, on: false };
  const tints = new Map();

  function tint(kind, key) {
    const id = kind + key;
    if (!tints.has(id)) {
      const h = hueOf(key);
      const css = kind === 'stamp' ? (dark ? `oklch(0.74 0.1 ${h})` : `oklch(0.5 0.13 ${h})`) : (dark ? `oklch(0.56 0.1 ${h})` : `oklch(0.76 0.11 ${h})`);
      tints.set(id, rgba(css).slice(0, 3));
    }
    return tints.get(id);
  }

  const atlas = createAtlas(gl, items, () => {
    gl.setCards(cardList());
    invalidate();
  });
  const labels = createLabels((tex) => gl.setTextures(null, tex));
  gl.setTextures(atlas.texture, null);

  const faces = () => [...desk, ...piles.map((p) => p.ids[0])];

  function cardList() {
    const out = [];
    const push = (i, pose, face) => {
      const it = items[i];
      const tag = it.g[0] || '';
      out.push({
        x: pose.x, y: pose.y, z: pose.z, rx: -Math.PI / 2, ry: pose.ry,
        tile: face ? atlas.tile(i) : null,
        stamp: tint('stamp', mainName(it.s)),
        tab: { x: -CARD.W / 2 + 20 + tabSlot(tag) * 22, color: tint('tab', tag) },
        sticky: !!it.n,
      });
    };
    desk.forEach((i, slot) => push(i, deskPose(slot, items[i].i), true));
    piles.forEach((p, pi) => {
      const stack = p.ids.slice().reverse();
      stack.forEach((i, k) => push(i, pilePose(pi, k, items[i].i), k === stack.length - 1));
    });
    return out;
  }

  function shadowList() {
    const out = desk.map((i, slot) => {
      const p = deskPose(slot, items[i].i);
      return { x: p.x, z: p.z, ry: p.ry, w: CARD.W, h: CARD.H };
    });
    piles.forEach((p, pi) => {
      const b = pilePose(pi, 0, items[p.ids[p.ids.length - 1]].i);
      out.push({ x: b.x, z: b.z, ry: b.ry, w: CARD.W, h: CARD.H });
    });
    out.push({ x: 0, z: cab.z - cab.depth / 2 + 12, ry: 0, w: cab.width, h: cab.depth + 24 });
    return out;
  }

  function drawerList(now) {
    return drawers.map((d, k) => {
      let dz = 0;
      if (slide !== null) dz = -(CAB.DEPTH - 20) * (1 - ease(clamp((now - slide - k * STAGGER) / SLIDE, 0, 1)));
      return { x: cab.slots[k].x, y: cab.slots[k].y, z: cab.z + dz, tile: labels.drawerTile(k) };
    });
  }

  function drawLabels() {
    labels.draw(
      drawers.map((d) => ({ name: drawerName(d), count: t('shares3d.cards', d.ids.length) })),
      piles.map((p) => `${t('shares3d.week', md(p.week))} · ${p.ids.length}`),
    );
    gl.setDrawers(drawerList(performance.now()));
    gl.setPileLabels(piles.map((p, pi) => Object.assign(pileLabelPose(pi), { tile: labels.pileTile(pi) })));
  }

  function progress() {
    const span = stage.offsetHeight - window.innerHeight;
    return span > 0 ? clamp(-stage.getBoundingClientRect().top / span, 0, 1) : 0;
  }

  function placeLamp(p) {
    if (!dark) {
      gl.setLamp(false);
      return;
    }
    if (p > CABINET_AT) {
      gl.setLamp(true, 0, cab.height + 120, cab.z + 260, 520);
      return;
    }
    const hit = pointer.on ? gl.deskPoint(pointer.x, pointer.y) : null;
    const x = hit ? hit[0] : cam.look[0];
    const z = hit ? Math.max(hit[2], cab.z + 60) : cam.look[2];
    gl.setLamp(true, x, 260, z + 40, 380);
  }

  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    let busy = atlas.pump() || atlas.pending();
    const p = progress();
    const target = cameraAt(p, canvas.clientWidth / Math.max(1, canvas.clientHeight), cab);
    if (!cam.pos || reduce.matches) {
      cam.pos = target.pos.slice();
      cam.look = target.look.slice();
    } else {
      for (let k = 0; k < 3; k++) {
        cam.pos[k] = approach(cam.pos[k], target.pos[k], dt, 8);
        cam.look[k] = approach(cam.look[k], target.look[k], dt, 8);
      }
    }
    if (gap(cam.pos, target.pos) + gap(cam.look, target.look) > 0.1) busy = true;
    bar.classList.toggle('away', p < CABINET_AT);
    if (slide !== null) {
      gl.setDrawers(drawerList(now));
      if (now - slide > SLIDE + STAGGER * drawers.length) slide = null;
      busy = true;
    }
    placeLamp(p);
    gl.render(cam);
    if (!root.classList.contains('live')) root.classList.add('live', 'lit');
    if (busy) invalidate();
    else last = 0;
  }

  function invalidate() {
    if (!raf && ready) raf = requestAnimationFrame(frame);
  }

  function applyColors() {
    const tokens = readTokens(TOKENS);
    gl.setColors(tokens);
    const d = tokens.desk;
    dark = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2] < 0.3;
    tints.clear();
    gl.setCards(cardList());
    invalidate();
  }

  function pressKeys() {
    bar.querySelectorAll('[data-group-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.groupSet === mode)));
  }

  function setMode(m) {
    if (m === mode || !MODES.includes(m)) return;
    mode = m;
    try { localStorage.setItem(GROUP_KEY, m); } catch (e) {}
    pressKeys();
    drawers = groups(items, mode);
    cab = cabinet(drawers.length);
    slide = reduce.matches ? null : performance.now();
    gl.setCabinet(cab);
    gl.setShadows(shadowList());
    drawLabels();
    invalidate();
  }

  bar.querySelectorAll('[data-group-set]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.groupSet)));
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.on = true;
    if (dark) invalidate();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.on = false;
    if (dark) invalidate();
  });
  window.addEventListener('scroll', invalidate, { passive: true });
  new ResizeObserver(() => {
    gl.resize(canvas.clientWidth, canvas.clientHeight);
    invalidate();
  }).observe(canvas);
  canvas.addEventListener('webglcontextrestored', () => {
    atlas.reset();
    labels.restore();
    applyColors();
    invalidate();
  });
  watchTheme(applyColors);
  document.addEventListener('langchange', () => {
    drawLabels();
    invalidate();
  });

  pressKeys();
  gl.resize(canvas.clientWidth, canvas.clientHeight);
  gl.setCabinet(cab);
  gl.setShadows(shadowList());
  applyColors();
  drawLabels();
  loadFonts(items).then(() => {
    drawLabels();
    atlas.want(faces());
    invalidate();
  });
  gl.warm().then(() => {
    ready = true;
    invalidate();
  });
}

start();
```

- [ ] **Step 2: 檢查與建置**

```bash
node --check assets/shares3d/main.js && echo OK
rtk proxy grep -rnE "from '\.\.?/" assets/shares3d assets/scene3d || echo NONE
```
Expected: `OK`、`NONE`。接著〈建置〉、〈建置後檢查〉、〈Node 測試(全部)〉都通過。

- [ ] **Step 3: 0 則的情境**(Review Focus 3)

讀 `main.js` 確認:`items.length === 0` 時加 `.fail` 並 return(顯示保底清單的「還沒有分享的文章」);
`pickDesk` 對 1 則回傳 `desk: [0]`、`piles: []`(Task 2 測試已涵蓋)。

- [ ] **Step 4: Commit**

```bash
git add assets/shares3d/main.js
git commit -m "feat(shares3d): 捲動帶鏡頭走過桌面、週疊、目錄櫃;分組切換、主題與語言、夜間檯燈"
```

- [ ] **Step 5: 交給使用者實測(不要自己宣稱通過)**

```bash
docker run --rm -p 4000:4000 -v "$PWD":/srv -v jekyll-bundle:/usr/local/bundle -w /srv ruby:3.4 \
  bash -c "bundle install --quiet && bundle exec jekyll serve -H 0.0.0.0 -l --force_polling"
```

請使用者在 Brave 開 `http://localhost:4000/shares-3d/`(開發者工具的 Console 有錯誤要一併回報):

1. 一開始:桌上平放最近的卡(索引卡紅線藍格線、來源、日期、標題、右側圓形印章、上緣彩色色標);卡下有淡淡的陰影。
2. 往下捲:鏡頭往後走過週疊(每疊前面桌上印著「M/D 那週 · N」,最上面那張有字);再往下停在目錄櫃,整個櫃子在畫面裡。
3. 捲到櫃子時下方出現「依 tag / 依來源 / 依月份」;切換時抽屜一格格推出來,標籤寫組名與張數;重新整理後記得上次的分組。
4. 切換主題(晝 / 夜):顏色立即正確;夜間檯燈跟著游標照桌面,捲到櫃子時燈移到櫃子前上方。
5. 切換語言:抽屜的「其他來源 / 未分類 / 月份 / 張數」與週疊標籤換成英文。
6. 手機寬度(或 iPhone):鏡頭拉遠、卡片完整在畫面內,捲動不卡。
7. 停用 JavaScript:看到跟首頁一樣的卡片格狀清單。
8. `/books/` 一切照舊(換行函式搬了家)。

有問題就停下來,用 superpowers:systematic-debugging 找原因。**不 push、不開 PR。**

---

## 之後(各自另寫計畫)

- **階段 3 互動**:拿起 → HTML 卡(對齊、剪報、翻面、換一張、開原文)、攤開週疊、撥卡、燈光淡出(per-instance 淡出)、停留回饋、提示列、觸控。
- **階段 4 收尾**:開場(暗房 / 素描,接 `scene3d/intro.js`)、搜尋、seen / archive 記號、無障礙清單連動、reduced motion、取代首頁、CLAUDE.md 與 SPEC 更新。
