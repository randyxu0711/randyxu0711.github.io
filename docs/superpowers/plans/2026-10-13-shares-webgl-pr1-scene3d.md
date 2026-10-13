# 分享頁 WebGL 版 PR 1:共用場景底座 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把書架與之後分享頁(和 About)共用的場景零件從 `assets/books3d/` 抽到 `assets/scene3d/`,書架行為完全不變。

**Architecture:** 只搬「第二個場景一定會用到、而且不帶書架專屬單位」的零件:色彩讀取、動畫曲線、開場的亮度曲線(純函式)、
shader 片段、盒子幾何、開場幕的 CSS。檯燈落點、`invalidate()`、context 遺失的恢復都跟書架的單位與狀態綁在一起,留在 `main.js`,
分享頁 PR 2 再照同樣的寫法實作(用同一組 uniform)。所有 import 都用 import map 的裸名稱(`scene3d/…`),帶 `?v=` 破快取。

**Tech Stack:** Jekyll 4.4(Docker 建置)、three.js r170(`assets/vendor/three/`)、原生 ES modules + import map、Node 內建 `node:test`(只測純函式)。

**Spec:** `docs/shares-webgl.md`(〈技術〉→〈共用場景底座〉、〈分階段〉PR 1)

## Global Constraints

- **書架的行為不能變**:同一個 PR 只搬不改(spec〈共用場景底座〉)。
- 程式放 `assets/scene3d/`,**不放 `assets/modules/`**(那裡的檔案每頁都載入)。
- import 一律用裸名稱 `scene3d/<檔名>`,import map 與 modulepreload 都要列,網址帶 `?v={{ site.time | date: '%s' }}`。
- 不寫註解(使用者偏好),除非真的特殊。
- 前端沒有測試框架:純函式用 `node:test`(Node 內建,不加 npm 依賴);其餘靠建置 + htmlproofer + 手動檢查。
- 手動檢查交給使用者(Brave 桌面 + iPhone);我們只回報建置與自動檢查結果。
- commit 訊息用中文、`type(scope): 說明` 格式(同 repo 歷史),結尾加
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`。
- 分支:`shares-webgl`(已建立,spec 已 commit)。

建置與檢查指令(後面的步驟直接引用):

```bash
# 建置(repo 根目錄)
docker run --rm -v "$PWD":/srv -v jekyll-bundle:/usr/local/bundle -w /srv ruby:3.4 \
  bash -c "bundle install --quiet && bundle exec jekyll build"
# 建置後檢查
docker run --rm -v "$PWD":/srv -v jekyll-bundle:/usr/local/bundle -w /srv ruby:3.4 \
  bash -c "bundle install --quiet && bundle exec htmlproofer _site --disable-external --ignore-urls '/^http:\/\/127.0.0.1/,/^http:\/\/0.0.0.0/,/^http:\/\/localhost/'"
```

Docker 建置會留下 root 擁有的檔案(`_site`、`.jekyll-cache`);它們已 gitignore,不用處理。

## Review Focus

1. **同一個模組被兩個網址載入**(裸名稱 vs 相對路徑,或少了 `?v=`):瀏覽器會載兩份、部署後拿到舊快取。
   預期:`assets/books3d/` 與 `assets/scene3d/` 裡沒有任何 `from './` 或 `from '../`;建置後 `_site/books/index.html` 的
   import map 裡每個 `scene3d/*.js` 都有 `?v=`。→ Task 1 Step 6、Task 3 Step 6 的 grep 檢查。
2. **`scene3d` 模組抓不到或丟錯時幕一直蓋著**:`books.html` 的 `error` 監聽只認 `books3d|vendor/three`。
   預期:任何 `/assets/scene3d/` 的載入錯誤也會加上 `.fail`、顯示純 HTML 書單。→ Task 1 Step 3 改正規式,Step 6 檢查。
3. **開場亮度曲線改壞**(夜間閃兩下、白天暈開、快取時的短版、reduced motion):預期與搬之前逐點相同。
   → Task 2 的參考比對測試。
4. **幕的 CSS 改了 class 後首次繪製不對**(有 JS 時先閃出書單,或沒有幕):預期跟搬之前一模一樣。
   → Task 4 Step 5 檢查建置出來的 class 與 CSS 順序,Step 7 交給使用者實測。
5. **shader 片段搬家時字串變了**(多一個空白不要緊,少一個 uniform 就黑畫面):預期六個 shader 的最終字串逐字相同。
   → Task 3 Step 1/5 的前後比對。

---

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `assets/scene3d/anim.js` | 從 `assets/books3d/anim.js` 搬(git mv,內容不變) | 曲線與插值 |
| `assets/scene3d/colors.js` | 從 `assets/books3d/colors.js` 搬,`readTokens(names)` 改收名單 | 讀 CSS token、主題變更 |
| `assets/scene3d/intro.js` | 新增 | 開場亮度曲線(純函式)與時間常數 |
| `assets/scene3d/glsl.js` | 新增 | `LIGHT` / `REVEAL` / `SKETCH` shader 片段 |
| `assets/scene3d/geometry.js` | 新增 | `box()`:帶 `face` 屬性的盒子幾何 |
| `assets/scene3d/scene3d.css` | 新增 | 開場幕(`::before`)與 `.soft` 淡入 |
| `assets/books3d/main.js` | 修改 | 改 import;開場曲線改呼叫 `intro.js` |
| `assets/books3d/scene.js` | 修改 | shader 片段與 `box()` 改 import |
| `assets/books3d/books3d.css` | 修改 | 拿掉搬走的幕規則 |
| `_layouts/books.html` | 修改 | `shared:` 清單、import map、modulepreload、CSS、`s3d` class、error 正規式 |
| `tools/scene3d/hooks.mjs`、`tools/scene3d/resolve.mjs` | 新增 | 讓 Node 測試認得 `scene3d/…` 裸名稱 |
| `tools/scene3d/intro.test.mjs` | 新增 | 開場曲線的參考比對測試 |
| `.github/workflows/test.yml` | 修改 | 加 Node 測試 job |
| `CLAUDE.md` | 修改 | 架構與測試段落記上 `assets/scene3d/` |

---

### Task 1: 搬 `anim.js` 與 `colors.js` 到 `assets/scene3d/`,版面支援共用模組

**Files:**
- Move: `assets/books3d/anim.js` → `assets/scene3d/anim.js`
- Move: `assets/books3d/colors.js` → `assets/scene3d/colors.js`
- Modify: `assets/scene3d/colors.js`(`readTokens`)
- Modify: `assets/books3d/main.js:1-5`(import)、`main.js:988`(`readTokens()` 呼叫)
- Modify: `_layouts/books.html:1-18`(front matter、import map、modulepreload)與檔尾 error 監聽

**Interfaces:**
- Produces: `scene3d/anim.js` 匯出 `bezier, ease, easeInOut, lerp, clamp, approach`(簽名不變);
  `scene3d/colors.js` 匯出 `rgba(css) → [r,g,b,a]`、`readTokens(names: string[]) → { [name]: [r,g,b,a] }`、`hexRgb(hex) → [r,g,b]`、`watchTheme(cb)`。
  `_layouts/books.html` front matter 新增 `shared: [...]`,之後的 task 往這個清單加檔名。

- [ ] **Step 1: 搬檔**

```bash
mkdir -p assets/scene3d
git mv assets/books3d/anim.js assets/scene3d/anim.js
git mv assets/books3d/colors.js assets/scene3d/colors.js
```

- [ ] **Step 2: `readTokens` 改收名單**

`assets/scene3d/colors.js`:刪掉第一行的 `const TOKENS = [...]`,`readTokens` 改成:

```js
export function readTokens(names) {
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  names.forEach((name) => { out[name] = rgba(cs.getPropertyValue('--' + name).trim() || '#808080'); });
  return out;
}
```

`assets/books3d/main.js` 開頭的 import 改成:

```js
import { layout, thickness, height, W, PAD, GAP, LIP, SORT_NAMES } from 'books3d/layout.js';
import { readTokens, hexRgb, watchTheme } from 'scene3d/colors.js';
import { createScene } from 'books3d/scene.js';
import { createTextures, loadFonts, drawBack, bigCover, titleOf, authorOf } from 'books3d/textures.js';
import { ease, easeInOut, lerp, clamp, approach } from 'scene3d/anim.js';
```

在 `const SORT_KEY = 'books3d-sort';` 下一行加:

```js
const TOKENS = ['desk', 'shelf', 'paper', 'paper-deep', 'edge', 'edge-n', 'drop-near', 'unlit', 'ink'];
```

`applyColors()` 裡 `const tokens = readTokens();` 改成 `const tokens = readTokens(TOKENS);`。

- [ ] **Step 3: 版面載入共用模組**

`_layouts/books.html` 的 front matter 改成:

```yaml
---
layout: default
modules: [layout.js, scene.js, textures.js]
shared: [anim.js, colors.js]
---
```

import map 改成(`three` 之後先列 shared,再列 modules):

```liquid
<script type="importmap">{"imports": {
  "three": "{{ '/assets/vendor/three/three.module.min.js' | relative_url }}"
  {%- for m in layout.shared %},
  "scene3d/{{ m }}": "{{ '/assets/scene3d/' | append: m | relative_url }}?v={{ v }}"
  {%- endfor %}
  {%- for m in layout.modules %},
  "books3d/{{ m }}": "{{ '/assets/books3d/' | append: m | relative_url }}?v={{ v }}"
  {%- endfor %}
}}</script>
```

modulepreload:在 `books3d/main.js` 那行之後、`layout.modules` 迴圈之前加:

```liquid
{%- for m in layout.shared %}
<link rel="modulepreload" href="{{ '/assets/scene3d/' | append: m | relative_url }}?v={{ v }}">
{%- endfor %}
```

檔尾 error 監聽的正規式改成也認 `scene3d`:

```js
  if (/\/assets\/(books3d|scene3d|vendor\/three)\//.test(e.target.src || e.filename || '') && !root.classList.contains('on')) root.classList.add('fail');
```

- [ ] **Step 4: 確認沒有相對路徑 import**

Run: `grep -rnE "from '\.\.?/" assets/books3d assets/scene3d || echo NONE`
Expected: `NONE`

- [ ] **Step 5: 建置**

Run: 上面〈建置〉指令
Expected: 結束碼 0,沒有 Liquid 錯誤。

- [ ] **Step 6: 檢查建置結果**

```bash
grep -o '"scene3d/[a-z]*\.js": "[^"]*"' _site/books/index.html
grep -c 'rel="modulepreload" href="/assets/scene3d/' _site/books/index.html
grep -o 'books3d|scene3d|vendor' _site/books/index.html
python3 -c "import json,re;s=open('_site/books/index.html').read();json.loads(re.search(r'<script type=\"importmap\">(.*?)</script>',s,re.S).group(1));print('importmap ok')"
```

Expected:兩行 `"scene3d/anim.js": "/assets/scene3d/anim.js?v=…"`、`"scene3d/colors.js": …`;modulepreload 計數 `2`;
出現 `books3d|scene3d|vendor`;`importmap ok`。

- [ ] **Step 7: Commit**

```bash
git add -A assets/books3d assets/scene3d _layouts/books.html
git commit -m "refactor(scene3d): anim.js、colors.js 搬到共用的 assets/scene3d/,readTokens 改收名單

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 開場亮度曲線抽成 `scene3d/intro.js`(TDD,參考比對)

**Files:**
- Create: `tools/scene3d/resolve.mjs`、`tools/scene3d/hooks.mjs`
- Create: `tools/scene3d/intro.test.mjs`
- Create: `assets/scene3d/intro.js`
- Modify: `assets/books3d/main.js:22-27`(常數)、`main.js:5`(import)、`main.js:549-563`(`introLevels`)、呼叫處 `main.js:571`、`main.js:994`
- Modify: `_layouts/books.html`(`shared` 加 `intro.js`)
- Modify: `.github/workflows/test.yml`

**Interfaces:**
- Consumes: `scene3d/anim.js` 的 `ease, lerp, clamp`(Task 1)。
- Produces: `scene3d/intro.js` 匯出
  `LIGHT_MIN = 300`、`LIGHT_MAX = 1500`、
  `introK(el: number, { reduce: boolean, lampOn: boolean, quick: boolean|null }) → number`(開燈前 `el < 0` 回 1;回 0 代表開場結束)、
  `introLevels(k: number, on: boolean, lampOn: boolean, darkness: number) → { unlit: number, sketch: number }`
  (`unlit` 給 `gl.setUnlit`,`sketch` 給 `gl.setSketch`;不在開場時 `unlit = 0`、`sketch = 9`)。

- [ ] **Step 1: Node 解析裸名稱的 hook**

`tools/scene3d/resolve.mjs`:

```js
const ROOT = new URL('../../assets/', import.meta.url);

export async function resolve(spec, ctx, next) {
  if (spec.startsWith('scene3d/')) return { url: new URL(spec, ROOT).href, format: 'module', shortCircuit: true };
  return next(spec, ctx);
}
```

`tools/scene3d/hooks.mjs`:

```js
import { register } from 'node:module';

register('./resolve.mjs', import.meta.url);
```

- [ ] **Step 2: 寫失敗的測試**

`tools/scene3d/intro.test.mjs`。`reference` 是從 `assets/books3d/main.js` 現在的 `introLevels` 逐字抄來的(搬之前的行為):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ease, lerp, clamp } from 'scene3d/anim.js';
import { introK, introLevels, LIGHT_MIN, LIGHT_MAX } from 'scene3d/intro.js';

const DAWN = 1400;
const DAWN_QUICK = 600;
const REVEAL_FROM = -0.35;
const REVEAL_TO = 1.4;

function reference(el, reduce, lampOn, quick, darkness) {
  let intro = true;
  let k = 1;
  if (el >= 0) {
    if (reduce) k = 0;
    else if (!lampOn) k = 1 - ease(clamp(el / (quick ? DAWN_QUICK : DAWN), 0, 1));
    else if (quick) k = el < 70 ? 1 : 0.7 * (1 - ease(clamp((el - 70) / 300, 0, 1)));
    else if (el < 84) k = 1;
    else if (el < 168) k = 0.3;
    else if (el < 252) k = 0.8;
    else k = 0.8 * (1 - ease(clamp((el - 252) / 400, 0, 1)));
  }
  if (k === 0) intro = false;
  return { k, unlit: intro && lampOn ? darkness * k : 0, sketch: intro && !lampOn ? lerp(REVEAL_TO, REVEAL_FROM, k) : 9 };
}

test('跟搬之前的 introLevels 逐點相同', () => {
  for (const reduce of [false, true])
    for (const lampOn of [false, true])
      for (const quick of [null, false, true])
        for (let el = -1; el <= 2000; el += 7) {
          const want = reference(el, reduce, lampOn, quick, 0.9);
          const k = introK(el, { reduce, lampOn, quick });
          assert.equal(k, want.k, `k el=${el} reduce=${reduce} lampOn=${lampOn} quick=${quick}`);
          assert.deepEqual(introLevels(k, k !== 0, lampOn, 0.9), { unlit: want.unlit, sketch: want.sketch });
        }
});

test('開燈前全暗或全素描', () => {
  assert.equal(introK(-1, { reduce: false, lampOn: true, quick: null }), 1);
  assert.deepEqual(introLevels(1, true, true, 0.9), { unlit: 0.9, sketch: 9 });
  assert.deepEqual(introLevels(1, true, false, 0.9), { unlit: 0, sketch: 1.4 });
});

test('夜間檯燈閃兩下', () => {
  const at = (el) => introK(el, { reduce: false, lampOn: true, quick: false });
  assert.deepEqual([at(50), at(100), at(200)], [1, 0.3, 0.8]);
  assert.equal(at(700), 0);
});

test('reduced motion 一開燈就結束', () => {
  assert.equal(introK(0, { reduce: true, lampOn: true, quick: false }), 0);
  assert.deepEqual(introLevels(0, false, true, 0.9), { unlit: 0, sketch: 9 });
});

test('開燈時間常數', () => {
  assert.deepEqual([LIGHT_MIN, LIGHT_MAX], [300, 1500]);
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `node --import ./tools/scene3d/hooks.mjs --test tools/scene3d/intro.test.mjs`
Expected: FAIL,`Cannot find module …/assets/scene3d/intro.js`(或 ERR_MODULE_NOT_FOUND)。

- [ ] **Step 4: 實作 `assets/scene3d/intro.js`**

```js
import { ease, lerp, clamp } from 'scene3d/anim.js';

export const LIGHT_MIN = 300;
export const LIGHT_MAX = 1500;
const DAWN = 1400;
const DAWN_QUICK = 600;
const REVEAL_FROM = -0.35;
const REVEAL_TO = 1.4;

export function introK(el, { reduce, lampOn, quick }) {
  if (el < 0) return 1;
  if (reduce) return 0;
  if (!lampOn) return 1 - ease(clamp(el / (quick ? DAWN_QUICK : DAWN), 0, 1));
  if (quick) return el < 70 ? 1 : 0.7 * (1 - ease(clamp((el - 70) / 300, 0, 1)));
  if (el < 84) return 1;
  if (el < 168) return 0.3;
  if (el < 252) return 0.8;
  return 0.8 * (1 - ease(clamp((el - 252) / 400, 0, 1)));
}

export function introLevels(k, on, lampOn, darkness) {
  return {
    unlit: on && lampOn ? darkness * k : 0,
    sketch: on && !lampOn ? lerp(REVEAL_TO, REVEAL_FROM, k) : 9,
  };
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `node --import ./tools/scene3d/hooks.mjs --test tools/scene3d/intro.test.mjs`
Expected: `# pass 5`、`# fail 0`。

- [ ] **Step 6: `main.js` 改用 `intro.js`**

刪掉 `main.js` 的這六行常數:

```js
const LIGHT_MIN = 300;
const LIGHT_MAX = 1500;
const DAWN = 1400;
const DAWN_QUICK = 600;
const REVEAL_FROM = -0.35;
const REVEAL_TO = 1.4;
```

import 區最後加:

```js
import { introK, introLevels, LIGHT_MIN, LIGHT_MAX } from 'scene3d/intro.js';
```

把 `function introLevels(el) { … }` 整段(從 `function introLevels(el) {` 到它的結尾 `}`)換成:

```js
  function applyIntro(el) {
    const k = introK(el, { reduce: reduce.matches, lampOn, quick });
    if (k === 0) intro = false;
    const v = introLevels(k, intro, lampOn, darkness);
    gl.setUnlit(v.unlit);
    gl.setSketch(v.sketch);
  }
```

兩個呼叫處改名:`stepLight` 裡的 `introLevels(lit ? now - litT0 : -1);` 與 `applyColors` 裡的
`if (intro) introLevels(lit ? performance.now() - litT0 : -1);`,都把 `introLevels(` 換成 `applyIntro(`。

`_layouts/books.html` front matter:`shared: [anim.js, colors.js, intro.js]`。

- [ ] **Step 7: 確認 main.js 沒有殘留**

Run: `grep -nE "DAWN|REVEAL_|introLevels\(" assets/books3d/main.js`
Expected: 只有 `const v = introLevels(k, intro, lampOn, darkness);` 一行。
Run: `node --check assets/books3d/main.js && echo OK`
Expected: `OK`

- [ ] **Step 8: CI 跑 Node 測試**

`.github/workflows/test.yml` 改成:

```yaml
name: Test

on:
  push:
    paths: [tools/**, assets/scene3d/**, .github/ISSUE_TEMPLATE/**, .github/workflows/test.yml]
  pull_request:

jobs:
  pytest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: pip install pytest pillow pyyaml
      - run: python3 -m pytest tools -q
  node:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: node --import ./tools/scene3d/hooks.mjs --test tools/scene3d/intro.test.mjs
```

(ubuntu-latest 內建 Node ≥ 20,`module.register` 與 `node:test` 都有,不用 setup-node。)

- [ ] **Step 9: 建置並檢查**

Run: 〈建置〉指令,接著
`grep -o '"scene3d/intro.js": "[^"]*"' _site/books/index.html`
Expected: 一行,帶 `?v=`。

- [ ] **Step 10: Commit**

```bash
git add assets/scene3d/intro.js assets/books3d/main.js _layouts/books.html tools/scene3d .github/workflows/test.yml
git commit -m "refactor(scene3d): 開場亮度曲線抽成 intro.js 純函式,加 Node 參考比對測試

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: shader 片段與盒子幾何抽成 `scene3d/glsl.js`、`scene3d/geometry.js`

**Files:**
- Create: `assets/scene3d/glsl.js`、`assets/scene3d/geometry.js`
- Modify: `assets/books3d/scene.js:1-79`
- Modify: `_layouts/books.html`(`shared` 加 `glsl.js, geometry.js`)
- 暫存腳本(不 commit):`$SCRATCH/shaders.mjs`,`SCRATCH=$(mktemp -d)`

**Interfaces:**
- Produces: `scene3d/glsl.js` 匯出字串 `LIGHT`(宣告 `uLight, uAmbient, uKey, uLamp, uLampColor, uLampReach, varying vWorld`,
  函式 `vec3 lit(vec3 c, vec3 n)`)、`REVEAL`(`uniform vec4 uSketch`,`float sketchAmount()`)、
  `SKETCH`(含 `REVEAL`,`uniform vec3 uInk`,`vec3 sketch(vec3 col, vec3 n, vec2 uv)`;使用端要先宣告 `uniform vec3 uDesk`)。
  `scene3d/geometry.js` 匯出 `box(x0, x1, y0, y1, z0, z1) → THREE.BufferGeometry`(屬性 `position, normal, uv, face`;face 0–5 = +x −x +y −y +z −z)。

- [ ] **Step 1: 記下搬之前的 shader 字串**

```bash
SCRATCH=$(mktemp -d)
cat > "$SCRATCH/shaders.mjs" <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [src, out] = process.argv.slice(2);
const root = process.cwd();
let s = readFileSync(src, 'utf8')
  .replace("import * as THREE from 'three';", 'const THREE = {};')
  .replace(/^import \{ box \} from 'scene3d\/geometry\.js';$/m, 'const box = () => {};')
  .replace(/from 'books3d\/layout\.js'/, `from '${pathToFileURL(root + '/assets/books3d/layout.js').href}'`)
  .replace(/from 'scene3d\/glsl\.js'/, `from '${pathToFileURL(root + '/assets/scene3d/glsl.js').href}'`);
s += '\nexport { BOOK_VERT, BOOK_FRAG, SHELF_VERT, SHELF_FRAG, SHADOW_VERT, SHADOW_FRAG };\n';
const tmp = out + '.mjs';
writeFileSync(tmp, s);
const m = await import(pathToFileURL(tmp).href);
writeFileSync(out, JSON.stringify({ ...m }, null, 1));
EOF
node "$SCRATCH/shaders.mjs" assets/books3d/scene.js "$SCRATCH/before.json" && wc -c "$SCRATCH/before.json"
```

Expected: 印出 `before.json` 的大小(幾 KB),沒有錯誤。

- [ ] **Step 2: 新增 `assets/scene3d/glsl.js`**

把 `scene.js` 第 39–79 行的三個常數原封不動搬過來,加上 `export`:

```js
export const LIGHT = /* glsl */ `
uniform vec3 uLight;
uniform float uAmbient;
uniform float uKey;
uniform vec4 uLamp;
uniform vec3 uLampColor;
uniform float uLampReach;
varying vec3 vWorld;
vec3 lit(vec3 c, vec3 n) {
  vec3 nn = normalize(n);
  vec3 day = vec3(uAmbient + uKey * max(dot(nn, uLight), 0.0));
  vec3 d = uLamp.xyz - vWorld;
  float dist = length(d);
  float fall = 1.0 / (1.0 + pow(dist / uLampReach, 2.0));
  vec3 lamp = day * 0.4 + uLampColor * (1.3 * max(dot(nn, d / dist), 0.0) * fall);
  return c * mix(day, lamp, uLamp.w);
}
`;

export const REVEAL = /* glsl */ `
uniform vec4 uSketch;
float sketchAmount() {
  if (uSketch.w > 2.0) return 0.0;
  vec2 p = (gl_FragCoord.xy - uSketch.xy) / uSketch.z;
  float d = length(p) + 0.05 * sin(p.x * 9.0 + p.y * 5.0) + 0.04 * sin(p.y * 13.0 - p.x * 7.0);
  return smoothstep(uSketch.w - 0.3, uSketch.w, d);
}
`;

export const SKETCH = /* glsl */ `
${REVEAL}
uniform vec3 uInk;
vec3 sketch(vec3 col, vec3 n, vec2 uv) {
  vec2 px = min(uv, 1.0 - uv) / max(fwidth(uv), vec2(1e-5));
  float s = sketchAmount();
  if (s <= 0.0) return col;
  float line = 1.0 - smoothstep(0.5, 1.5, min(px.x, px.y));
  vec3 paper = mix(uDesk, uInk, 0.06 * (1.0 - max(dot(normalize(n), uLight), 0.0)));
  return mix(col, mix(paper, uInk, line * 0.75), s);
}
`;
```

- [ ] **Step 3: 新增 `assets/scene3d/geometry.js`**

把 `scene.js` 第 10–37 行的 `box` 原封不動搬過來:

```js
import * as THREE from 'three';

export function box(x0, x1, y0, y1, z0, z1) {
  const faces = [
    [[1, 0, 0], [x1, (y0 + y1) / 2, (z0 + z1) / 2], [0, 0, -(z1 - z0)], [0, y1 - y0, 0]],
    [[-1, 0, 0], [x0, (y0 + y1) / 2, (z0 + z1) / 2], [0, 0, z1 - z0], [0, y1 - y0, 0]],
    [[0, 1, 0], [(x0 + x1) / 2, y1, (z0 + z1) / 2], [x1 - x0, 0, 0], [0, 0, -(z1 - z0)]],
    [[0, -1, 0], [(x0 + x1) / 2, y0, (z0 + z1) / 2], [x1 - x0, 0, 0], [0, 0, z1 - z0]],
    [[0, 0, 1], [(x0 + x1) / 2, (y0 + y1) / 2, z1], [x1 - x0, 0, 0], [0, y1 - y0, 0]],
    [[0, 0, -1], [(x0 + x1) / 2, (y0 + y1) / 2, z0], [-(x1 - x0), 0, 0], [0, y1 - y0, 0]],
  ];
  const pos = [], nor = [], uv = [], face = [], index = [];
  faces.forEach(([n, c, u, v], f) => {
    const base = pos.length / 3;
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([a, b]) => {
      for (let k = 0; k < 3; k++) pos.push(c[k] + (a - 0.5) * u[k] + (b - 0.5) * v[k]);
      nor.push(...n);
      uv.push(a, b);
      face.push(f);
    });
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('face', new THREE.Float32BufferAttribute(face, 1));
  g.setIndex(index);
  return g;
}
```

- [ ] **Step 4: `scene.js` 改 import**

刪掉 `scene.js` 裡的 `function box(...) { … }`(第 10–37 行)與 `const LIGHT`、`const REVEAL`、`const SKETCH` 三段(第 39–79 行),
開頭改成:

```js
import * as THREE from 'three';
import { W, LIP } from 'books3d/layout.js';
import { LIGHT, REVEAL, SKETCH } from 'scene3d/glsl.js';
import { box } from 'scene3d/geometry.js';
```

`_layouts/books.html` front matter:`shared: [anim.js, colors.js, intro.js, glsl.js, geometry.js]`。

- [ ] **Step 5: 比對 shader 字串前後相同**

```bash
node "$SCRATCH/shaders.mjs" assets/books3d/scene.js "$SCRATCH/after.json"
cmp "$SCRATCH/before.json" "$SCRATCH/after.json" && echo SAME
diff <(git show HEAD:assets/books3d/scene.js | sed -n '/^function box/,/^}/p' | sed 's/^function box/export function box/') \
     <(sed -n '/^export function box/,/^}/p' assets/scene3d/geometry.js) && echo BOX SAME
node --check assets/books3d/scene.js && node --check assets/scene3d/glsl.js && echo OK
```

Expected: `SAME`、`BOX SAME`、`OK`。

- [ ] **Step 6: 建置並檢查**

Run: 〈建置〉指令,接著:

```bash
grep -o '"scene3d/[a-z]*\.js": "[^"]*"' _site/books/index.html | wc -l
grep -c 'rel="modulepreload" href="/assets/scene3d/' _site/books/index.html
grep -rnE "from '\.\.?/" assets/books3d assets/scene3d || echo NONE
```

Expected: `5`、`5`、`NONE`。

- [ ] **Step 7: Commit**

```bash
git add assets/scene3d/glsl.js assets/scene3d/geometry.js assets/books3d/scene.js _layouts/books.html
git commit -m "refactor(scene3d): 打光、素描、暗房的 shader 片段與 box() 抽到共用模組

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 開場幕的 CSS 抽成 `scene3d.css`,文件更新,交給使用者實測

**Files:**
- Create: `assets/scene3d/scene3d.css`
- Modify: `assets/books3d/books3d.css:36-44,46`(拿掉搬走的規則)
- Modify: `_layouts/books.html:7,19`(CSS 連結、`s3d` class)
- Modify: `assets/books3d/main.js:57`(canvas class)
- Modify: `CLAUDE.md`(架構、測試段落)

**Interfaces:**
- Produces: 任何場景頁的根元素加 `class="s3d"`、canvas 加 `class="s3d-canvas"`,就有開場幕:
  有 JS 時 `::before` 蓋幕(白天 `--desk`、夜間 `--unlit` 0.9),加 `.live` 或 `.fail` 時拿掉;
  根元素有 `.soft` 時 canvas 先透明,`.live` 時 450ms 淡入。PR 2 的分享頁直接用。

- [ ] **Step 1: 新增 `assets/scene3d/scene3d.css`**

```css
html.js .s3d::before { content: ""; position: fixed; inset: 0; z-index: 15; pointer-events: none;
  background: var(--desk); opacity: 1; }
html.js .s3d:is(.live, .fail)::before { opacity: 0; }
@media (prefers-color-scheme: dark) {
  html.js:not([data-theme="light"]) .s3d:not(.live, .fail)::before { background: var(--unlit); opacity: 0.9; }
}
html.js[data-theme="dark"] .s3d:not(.live, .fail)::before { background: var(--unlit); opacity: 0.9; }
.s3d.soft .s3d-canvas { opacity: 0; transition: opacity 450ms cubic-bezier(.3,.7,.2,1); }
.s3d.soft.live .s3d-canvas { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .s3d.soft .s3d-canvas { transition: none; } }
```

- [ ] **Step 2: `books3d.css` 拿掉搬走的規則**

刪掉這幾行(其他照舊,`html.js .b3d:not(.on):not(.fail) .b3d-list` 與 `.b3d.on:not(.lit) :is(...)` 留著):

```css
html.js .b3d::before { content: ""; position: fixed; inset: 0; z-index: 15; pointer-events: none;
  background: var(--desk); opacity: 1; }
html.js .b3d:is(.live, .fail)::before { opacity: 0; }
@media (prefers-color-scheme: dark) {
  html.js:not([data-theme="light"]) .b3d:not(.live, .fail)::before { background: var(--unlit); opacity: 0.9; }
}
html.js[data-theme="dark"] .b3d:not(.live, .fail)::before { background: var(--unlit); opacity: 0.9; }
.b3d.soft .b3d-canvas { opacity: 0; transition: opacity 450ms cubic-bezier(.3,.7,.2,1); }
.b3d.soft.live .b3d-canvas { opacity: 1; }
```

以及 `@media (prefers-reduced-motion: reduce) { .b3d.soft .b3d-canvas { transition: none; } }`。

- [ ] **Step 3: 版面與 canvas 加上共用 class**

`_layouts/books.html`:在 `books3d.css` 那行之前加

```liquid
<link rel="stylesheet" href="{{ '/assets/scene3d/scene3d.css' | relative_url }}?v={{ v }}">
```

`<section class="b3d" id="b3d">` 改成 `<section class="b3d s3d" id="b3d">`。

`assets/books3d/main.js`:`canvas.className = 'b3d-canvas';` 改成 `canvas.className = 'b3d-canvas s3d-canvas';`。

- [ ] **Step 4: 確認沒有殘留的幕規則**

Run: `grep -nE "::before|\.soft" assets/books3d/books3d.css || echo NONE`
Expected: `NONE`

- [ ] **Step 5: 建置、htmlproofer、檢查順序**

Run: 〈建置〉與〈建置後檢查〉指令,接著:

```bash
grep -o 'href="/assets/\(scene3d/scene3d\|books3d/books3d\)\.css' _site/books/index.html
grep -o '<section class="b3d s3d" id="b3d">' _site/books/index.html
node --import ./tools/scene3d/hooks.mjs --test tools/scene3d/intro.test.mjs
uvx --with pillow --with pyyaml pytest tools -q
```

Expected: 先 `scene3d/scene3d.css` 再 `books3d/books3d.css`;找到 section;Node 測試 `# fail 0`;pytest 全過。htmlproofer 沒有錯誤。

- [ ] **Step 6: 更新 `CLAUDE.md`**

〈書單〉的「**3D 書架是 WebGL**」那段,`程式在 assets/books3d/,只有這頁用 import map 載入。` 後面接一句:

```markdown
    跟其他場景頁共用的零件在 `assets/scene3d/`(`anim.js`、`colors.js`、`intro.js` 開場亮度曲線、`glsl.js` 打光 / 素描 / 暗房 shader 片段、
    `geometry.js` 的 `box()`、`scene3d.css` 開場幕);版面 front matter 的 `shared:` 列出要載入的共用模組,import 一律用裸名稱 `scene3d/…`。
```

〈測試〉段落最後加一行:

```markdown
共用場景的純函式用 Node 內建測試:`node --import ./tools/scene3d/hooks.mjs --test tools/scene3d/intro.test.mjs`(CI 也跑)。
```

- [ ] **Step 7: Commit**

```bash
git add assets/scene3d/scene3d.css assets/books3d/books3d.css assets/books3d/main.js _layouts/books.html CLAUDE.md
git commit -m "refactor(scene3d): 開場幕的 CSS 抽成 scene3d.css;CLAUDE.md 記上共用場景底座

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8: 交給使用者實測(不要自己宣稱通過)**

本機預覽:

```bash
docker run --rm -p 4000:4000 -v "$PWD":/srv -v jekyll-bundle:/usr/local/bundle -w /srv ruby:3.4 \
  bash -c "bundle install --quiet && bundle exec jekyll serve -H 0.0.0.0 -l --force_polling"
```

請使用者在 Brave 開 `http://localhost:4000/books/`,跟正式站逐項比對:

1. 夜間重新整理:暗房看得到形體 → 檯燈閃兩下 → 開燈;第二次(快取)閃一下就亮。
2. 白天重新整理:墨線素描 → 顏色從中央暈開;快取時 0.6 秒的短版。
3. 有 JS 時不先閃出純 HTML 書單;停用 JavaScript 時看到完整書單。
4. 夜間檯燈跟游標、拿起書時燈移到書前上方;翻封底、Goodreads 連結。
5. 切換主題(導覽列的主題鍵):顏色重讀正確。
6. iPhone:捲動不卡、開場正常。

有任何不同就停下來,用 superpowers:systematic-debugging 找原因。

- [ ] **Step 9: 開 PR(使用者實測通過後)**

```bash
git push -u origin shares-webgl
gh pr create --title "refactor(scene3d): 抽出書架與分享頁共用的場景底座" --body "$(cat <<'EOF'
分享頁 WebGL 版(docs/shares-webgl.md)PR 1:把書架的共用零件搬到 assets/scene3d/,書架行為不變。

- anim.js、colors.js 搬家;readTokens 改收名單
- 開場亮度曲線抽成 intro.js 純函式,Node 參考比對測試(CI 也跑)
- 打光 / 素描 / 暗房 shader 片段與 box() 抽成 glsl.js、geometry.js(六個 shader 最終字串逐字相同)
- 開場幕 CSS 抽成 scene3d.css(.s3d / .s3d-canvas)
- books.html 用 front matter 的 shared: 載入共用模組;error 監聽也認 scene3d

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## 之後的計畫(各自另寫,做完前一個再寫)

- **PR 2 場景與逛**:`/shares-3d/` 路由、資料 JSON、保底清單、桌子 / 週疊 / 目錄櫃形體、捲動鏡頭、卡片貼圖池、抽屜標籤、分組切換。
- **PR 3 互動**:拿起 → HTML 卡、翻面、換一張、攤開週疊、撥卡、燈光與淡出、停留回饋、提示列、觸控。
- **PR 4 收尾與上線**:開場、搜尋、seen / archive、無障礙清單連動、reduced motion、i18n、取代首頁。
