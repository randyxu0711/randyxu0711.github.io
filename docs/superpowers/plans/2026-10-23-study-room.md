# 書房 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓剪報桌、地球儀、書櫃成為同一個房間的三個位置:光的方向從一張平面圖推出,材質誠實,晝夜 × 桌機手機都成立。

**Architecture:** 新增純函式模組 `assets/scene3d/room.js` 存平面圖(房間座標)並換算成各場景的方向;共用 shader 片段(木紋、紙纖維、窗光投影)加進 `assets/scene3d/glsl.js`;材質 token 加進 `tokens.css`。三個場景依序改:剪報桌 → 地球儀 → 書櫃,每個場景一個交給使用者實測的里程碑。

**Tech Stack:** Jekyll 4.4、three.js r170(自寫 ShaderMaterial;地球儀用 MeshStandardMaterial + 真燈)、`node:test`。

**Spec:** `docs/study-room.md`(平面圖 https://claude.ai/artifact/LkxLyW1vCDLCS3jULeUgUs)。參考實作:`git stash show -p stash@{0}`(`spike-materials`,只參考、不 apply)。

## Global Constraints

- 單位公釐(地球儀場景是公尺,只取方向,不取距離)。
- 元件 CSS / shader 不寫色碼:顏色一律從 token 讀(`readTokens`),新 token 晝夜各一份,寫進 `docs/redesign/SLAB.md` 的 token 表並附來源。
- 白天只有窗光;夜間只有檯燈(剪報桌)與落地燈(書櫃、地球儀);燈與窗都不畫;光不跟游標或拿起的東西移動。
- 紙永遠是紙:剪報、名牌、拿起的 HTML 卡晝夜都用 `--paper-card` + `--paper-ink`。
- 開場(暗幕 / 素描淡入、夜間閃燈)、`.live` / `.lit` 時機不變;首次繪製不能變慢或閃。
- 不寫程式註解(除非是瀏覽器 bug 的 workaround)。
- 只在本機分支 `study-room` commit,不 push、不開 PR,除非使用者說。
- 每個場景完成:建置 + htmlproofer + Node 測試 + 晝夜 × 1440 / 360 / 390 / 430 截圖自查(Playwright,cwd = scratchpad),再交給使用者。

## Review Focus

1. 手機直立(2 欄、目錄櫃 2 欄,`cab.z` 不同):牆要貼著櫃子背面、桌緣與地板要在畫面裡合理 → Task 3 的 `deskRoom` 測試用 `narrow=true`。
2. 主題切換(晝 ↔ 夜、跟系統)時窗光與燈立即換,不用重載 → Task 4、5、6 的手動檢查項。
3. 桌面被窗光照到的平均亮度要接近 `--desk`,畫布與導覽列 / footer 的 `--desk` 底色之間不能出現接縫 → Task 4 截圖檢查。
4. 拿起剪報 / 書時,3D 卡與 HTML 卡換手不跳色(都是紙色) → Task 4 手動檢查。
5. WebGL context 遺失後重建(iOS 背景回收):新 uniform 與 token 要在 `webglcontextrestored` 後還原 → Task 4、6 沿用既有的 `setColors` 路徑,不另開。

---

### Task 1: 房間平面圖模組 `room.js`

**Files:**
- Create: `assets/scene3d/room.js`
- Create: `tools/scene3d/room.test.mjs`
- Modify: `_layouts/shares.html:3`、`_layouts/books.html:5`(`shared:` 加 `room.js`)
- Modify: `.github/workflows/test.yml:19`、`CLAUDE.md`〈測試〉的指令(列入 `tools/scene3d/room.test.mjs`)

**Interfaces:**
- Produces:
  - `ROOM`:平面圖常數(房間座標 x = 東、y = 上、z = 南,原點西北角地面,單位 mm),欄位至少 `W: 3600, D: 4200, H: 2700, DESK: { x0, z0, w: 1600, d: 800, top: 740, t: 32 }, WINDOW: { z0: 700, z1: 1900, sill: 900, h: 1200, cols: 4, rows: 3 }, DESK_LAMP: [x, y, z], FLOOR_LAMP: [x, y, z], BOOKCASE: [x, y, z], GLOBE: [x, y, z]`(位置照平面圖)。
  - `SUN`:房間座標中「指向太陽」的單位向量,從西方來、仰角 30°、方位往南偏 25°。
  - `toView(view: 'desk'|'books'|'globe', v: number[3]) → number[3]`:房間方向 → 場景方向。desk 面北(場景 = 房間);books 面東(房間 +x → 場景 −z,房間 +z → 場景 +x);globe 面南(房間 +z → 場景 −z,房間 −x → 場景 +x)。
  - `sunDir(view) → number[3]` = `toView(view, SUN)`。
  - `lampDir(view) → number[3]`:主體指向該畫面夜間燈的單位向量(desk:桌面中心 → DESK_LAMP;books:BOOKCASE → FLOOR_LAMP;globe:GLOBE → FLOOR_LAMP),已換成場景座標。

- [ ] **Step 1: 寫失敗的測試** `tools/scene3d/room.test.mjs`

```js
test('desk: sun from the left and slightly behind', () => { const [x, y, z] = sunDir('desk'); assert.ok(x < -0.5 && y > 0.3 && z > 0.1); });
test('books: sun from behind, slightly left', () => { const [x, y, z] = sunDir('books'); assert.ok(z > 0.5 && x < 0 && y > 0.3); });
test('globe: sun from the right and behind', () => { const [x, y, z] = sunDir('globe'); assert.ok(x > 0.5 && z > 0); });
test('desk lamp is front-left of the desk', () => { const [x, , z] = lampDir('desk'); assert.ok(x < 0 && z < 0); });
test('books floor lamp is on the right', () => { assert.ok(lampDir('books')[0] > 0.3); });
test('globe floor lamp is on the left', () => { assert.ok(lampDir('globe')[0] < -0.3); });
test('directions are unit vectors', () => { for (const v of ['desk', 'books', 'globe']) for (const d of [sunDir(v), lampDir(v)]) assert.ok(Math.abs(Math.hypot(...d) - 1) < 1e-9); });
test('furniture sits inside the room', () => { for (const p of [ROOM.DESK_LAMP, ROOM.FLOOR_LAMP, ROOM.BOOKCASE, ROOM.GLOBE]) assert.ok(p[0] >= 0 && p[0] <= ROOM.W && p[2] >= 0 && p[2] <= ROOM.D); });
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --import ./tools/scene3d/hooks.mjs --test tools/scene3d/room.test.mjs`
Expected: FAIL(找不到 `scene3d/room.js`)

- [ ] **Step 3: 實作 `assets/scene3d/room.js`**(上面 Interfaces 的匯出,純函式、不 import three)

- [ ] **Step 4: 跑全部 Node 測試**

Run: `node --import ./tools/scene3d/hooks.mjs --test tools/scene3d/*.test.mjs tools/shares3d/*.test.mjs tools/books3d/*.test.mjs`
Expected: 全部 PASS

- [ ] **Step 5: Commit** — `feat(scene3d): 書房平面圖模組,換算各場景的窗光與燈的方向`

### Task 2: 材質 token 與共用 shader 片段

**Files:**
- Modify: `assets/css/tokens.css`(晝夜三處都要:`:root`、`prefers-color-scheme: dark`、`[data-theme="dark"]`)
- Modify: `assets/scene3d/glsl.js`
- Modify: `docs/redesign/SLAB.md`(token 表加新列與來源)

**Interfaces:**
- Produces:
  - Token(晝 / 夜):`--wall #d8ccb4 / #160f0b`、`--oak #9a744e / #3e2a1b`、`--oak-face #ad875f / #4c3423`、`--paper-card #f4ecda / #dccdb0`、`--paper-ink #2a1f19 / #2a1f19`、`--paper-ink-3 #5c4f45 / #5a4b3e`(試作值;調整要附對比檢查)。
  - `glsl.js` 匯出 `MATTER`(字串),內含:`float hash21(vec2)`、`float vnoise(vec2)`、`float wood(vec2 p, float amt)`(遠處依 `fwidth(p.y)` 淡掉細紋與年輪)、`float fiber(vec2 p)`、uniform `uSun`(vec3,指向太陽)、`uSill`(vec4:窗所在牆的 x、窗台高、窗起點、窗寬)、`uCab`(vec4:遮擋盒半寬、高、前 z、後 z)、`float blocked(vec3 p)`(沿 `uSun` 的射線打到遮擋盒回 1)、`float window(vec3 p)`(窗格投影 0..1,邊緣寬度隨距離 `0.012 * t`,窗框 16mm,`cols × rows` 格)。

- [ ] **Step 1: 加 token**(值見上,三處都加)
- [ ] **Step 2: 加 `MATTER`**(可照 stash 的版本,`window()` 的窗高 = `uSill.w * 0.75`、4 × 3 格)
- [ ] **Step 3: SLAB.md 加 token 列**:每列寫用途與來源(木色參考和田三造配色或實木色票,寫出處;紙色沿用 `--paper` 系)
- [ ] **Step 4: 建置確認沒壞**:Docker 建置到 `-d /tmp/site`,首頁與 `/books/` 開起來沒有 console error
- [ ] **Step 5: Commit** — `feat(scene3d): 材質 token 與木紋、紙纖維、窗光投影 shader 片段`

### Task 3: 剪報桌的房間範圍(純函式)

**Files:**
- Modify: `assets/shares3d/layout.js`
- Test: `tools/shares3d/layout.test.mjs`

**Interfaces:**
- Consumes: `arrange(nDesk, nDrawers, narrow)`(既有)
- Produces: `export const ROOM_DESK = { W: 1600, T: 32, H: 740, FRONT: 520, GAP: 10 }`;`deskRoom(a) → { back, front, width }`,`back = a.cab.z - a.cab.depth - ROOM_DESK.GAP`、`front = ROOM_DESK.FRONT`、`width = ROOM_DESK.W`。

- [ ] **Step 1: 失敗的測試**

```js
test('wall sits right behind the catalog', () => { for (const narrow of [false, true]) { const a = arrange(6, 8, narrow); assert.equal(deskRoom(a).back, a.cab.z - a.cab.depth - 10); } });
test('desk front clears the front row of clippings', () => { for (const narrow of [false, true]) { const a = arrange(6, 8, narrow); assert.ok(deskRoom(a).front > a.front + CARD.H / 2 + 100); } });
test('desk is wider than the catalog', () => { const a = arrange(6, 20, false); assert.ok(deskRoom(a).width > a.cab.width + 400); });
```

- [ ] **Step 2: 跑 `node --import ./tools/scene3d/hooks.mjs --test tools/shares3d/layout.test.mjs`,確認 FAIL**
- [ ] **Step 3: 實作 `deskRoom`**
- [ ] **Step 4: 跑同一指令,確認 PASS**
- [ ] **Step 5: Commit** — `feat(shares3d): 書桌範圍跟著目錄櫃算`

### Task 4: 剪報桌場景(里程碑:交使用者實測)

**Files:**
- Modify: `assets/shares3d/scene.js`、`assets/shares3d/main.js`、`assets/shares3d/held.css`
- Modify: `CLAUDE.md`(首頁段:「夜間檯燈跟著主角走」改成固定;材質 token)、`docs/shares-webgl.md`(新增「v2.4 書房」段,指向 `docs/study-room.md`)

**Interfaces:**
- Consumes: `sunDir('desk')`、`lampDir('desk')`(Task 1);`MATTER`、材質 token(Task 2);`deskRoom(a)`(Task 3)
- Produces: `setLamp(on: boolean)`(不再收位置;燈在桌子左後角,位置 = 桌面中心沿 `lampDir('desk')` 換算,`reach` 約 1100);`setRoom(room)`(`setCabinet` 時用 `deskRoom` 的值更新桌子、牆、`uDeskBack`)

- [ ] **Step 1: 房間幾何**:書桌改成有厚度的盒子(寬 `ROOM_DESK.W`、從 `back` 到 `front`)、北牆平面在 `back`、地板在 `-ROOM_DESK.H`;`setCabinet` 呼叫 `setRoom(deskRoom(a))`(main.js 傳 `a` 或 `room`)
- [ ] **Step 2: 光**:`uLight = uSun = sunDir('desk')`、`uAmbient` 調到桌面平均亮度 ≈ `--desk`;`uSill` 由 `ROOM.WINDOW` 換算到場景座標;桌面 / 牆 / 剪報乘上 `window()`(只在白天,`uLamp.w` 為 0 時);接觸陰影(目錄櫃 ↔ 桌面、桌面 ↔ 牆、目錄櫃 ↔ 牆)
- [ ] **Step 3: 材質**:剪報紙色 + 紙纖維;目錄櫃橡木紋、名牌紙卡 + 黃銅框、黃銅拉手(高光);來源章混 `--paper-ink`;`held.css` 的 `.held` 把 `--face / --ink / --ink-3 / --paper` 指到紙色 token
- [ ] **Step 4: 固定檯燈**:main.js 的 `gl.setLamp(dark && lit)`,拿掉位置參數與跟著主角的計算
- [ ] **Step 5: 驗證**:Node 測試全過;Docker 建置 + htmlproofer;截圖晝夜 × 1440 / 360 / 390 / 430,桌面層與櫃子層都拍,中英各一次。自查:牆貼櫃背、桌緣在手機櫃子層看得到、窗格影子斜過剪報、夜間左亮右暗、畫布和導覽列之間沒有接縫;切換主題立即生效;拿起卡片不跳色
- [ ] **Step 6: Commit** — `feat(shares): 剪報桌放進書房:靠牆的書桌、西窗窗光、固定檯燈、橡木與黃銅`
- [ ] **Step 7: 交給使用者實測,等回饋再往下**

### Task 5: 地球儀(里程碑)

**Files:**
- Modify: `assets/books3d/globe.js`
- Modify: `docs/books-map.md`(夜間燈光段改成落地燈;指向 `docs/study-room.md`)

**Interfaces:**
- Consumes: `sunDir('globe')`、`lampDir('globe')`(Task 1);`--oak`、`--wall`(Task 2)

- [ ] **Step 1**:`sun.position` = `sunDir('globe')` × 距離(白天從右後方);`sun.castShadow` 照舊
- [ ] **Step 2**:夜間的 `key`(正上方聚光燈)改成從 `lampDir('globe')` 方向打的落地燈(SpotLight,位置 = 地球儀中心 + 方向 × 約 3m,高度不低於球頂);`glow` 移到牆上偏左;保留「燈照不到不是死黑」(`hemi` 夜間值)
- [ ] **Step 3**:`desk`(2.6 × 2.0 的桌板)換成矮櫃:盒子比底座寬約 1.6 倍、貼牆,顏色用 `--oak`,牆用 `--wall`
- [ ] **Step 4: 驗證**:同 Task 4 Step 5 的截圖組合(地球儀層);國家色階晝夜仍分得出 5 級
- [ ] **Step 5: Commit** — `feat(books): 地球儀放進書房:西窗從右來、落地燈從左來、矮櫃`
- [ ] **Step 6: 交給使用者實測**

### Task 6: 書櫃(里程碑)

**Files:**
- Modify: `assets/books3d/layout.js`、`assets/books3d/scene.js`、`assets/books3d/main.js`
- Test: `tools/books3d/layout.test.mjs`
- Modify: `CLAUDE.md`(書單段:「夜間模式自動開檯燈(跟著游標…)」改成固定落地燈;書櫃有櫃體)、`docs/books-webgl.md`

**Interfaces:**
- Consumes: `sunDir('books')`、`lampDir('books')`(Task 1);`MATTER`、`--oak`、`--wall`(Task 2);`layout(...)` 的 `shelves[]`(既有欄位 `x0, length, y, tallest`)
- Produces: `carcass(shelves) → Array<{ x, y, w, h, kind: 'side'|'back' }>`(每層:左右側板各一片,寬 `SIDE = 18`,貼在層板兩端外側;背板一片,寬 = 層長,高 = `tallest + ROW_GAP`,從層板頂往上);scene 的 `setCarcass(list)`、`setLamp(on: boolean)`(固定在 `lampDir('books')` 方向)

- [ ] **Step 1: 失敗的測試**

```js
test('every shelf gets two sides and a back', () => { const L = layout(books, opts); assert.equal(carcass(L.shelves).length, L.shelves.length * 3); });
test('sides flank the shelf ends', () => { const L = layout(books, opts); const s = L.shelves[0]; const [l, r] = carcass([s]).filter((p) => p.kind === 'side'); assert.equal(l.x + l.w, s.x0); assert.equal(r.x, s.x0 + s.length); });
test('back covers the row height', () => { const L = layout(books, opts); const s = L.shelves[0]; const b = carcass([s]).find((p) => p.kind === 'back'); assert.ok(b.h >= s.tallest && b.w === s.length); });
```
(`books` / `opts` 用該測試檔既有的 fixture)

- [ ] **Step 2: 跑 `node --import ./tools/scene3d/hooks.mjs --test tools/books3d/layout.test.mjs`,確認 FAIL**
- [ ] **Step 3: 實作 `carcass`**,跑同一指令確認 PASS
- [ ] **Step 4: 場景**:櫃體用 InstancedMesh(側板 `--oak` + 木紋、背板比層板暗一階);層板滑動時側板跟著層走;`uLight` = `sunDir('books')`(白天從背後,柔);夜間 `setLamp(on)` 固定在落地燈方向,拿掉跟游標與 `setLampAt` 跟拿起的書;開場的「開燈前不反應」照舊
- [ ] **Step 5: 驗證**:同 Task 4 Step 5(直立 / 陳列兩種排法、星等 / 年份分組都拍);索引軌、拿起、換排法、地圖鍵照常
- [ ] **Step 6: Commit** — `feat(books): 書櫃放進書房:櫃體、背後的窗光、右邊的落地燈`
- [ ] **Step 7: 交給使用者實測**;全部通過後更新記憶 `room-materials-followup`,問使用者要不要開 PR

---

## 修訂(2026-10-23):統一用 three.js 內建燈、材質、陰影

Task 1–3 照舊有效(`room.js`、材質 token、`deskRoom`)。Task 4 的自寫 shader 版已 commit(`14babbd`),由 Task 7 用內建方式重做;Task 5、6 由 Task 8、9 取代。規格見 `docs/study-room.md`〈渲染方式〉。

### Task 7: 剪報桌改用內建燈與材質(里程碑)

**Files:** Modify `assets/shares3d/scene.js`、`assets/scene3d/glsl.js`(`window()` / `blocked()` 拿掉,留 `wood` / `fiber`);Create `assets/scene3d/lights.js`。

**Interfaces:**
- Produces: `assets/scene3d/lights.js` 匯出 `windowGobo(cols: number, rows: number, bar: number) → THREE.CanvasTexture`(白底、窗框黑線,給 `SpotLight.map`);`roomLights(scene, { sun: number[3], lamp: number[3], target: number[3], reach: number }) → { sky, window, lamp, setNight(on: boolean), setColors(tok) }`(白天:`window` 開、`lamp` 關;夜間反之;`sky` 晝夜不同強度)。
- `scene.js` 對外介面不變(`setLamp(on)`、`setCabinet`、`setColors`…),main.js 不動。

- [ ] **Step 1**:renderer 開 `shadowMap`(PCFSoft);桌、牆、地板、目錄櫃、抽屜、拉手、托盤改 `MeshStandardMaterial`(木頭 roughness ~0.7、黃銅 metalness ~0.6),木紋 / 紙纖維用 `onBeforeCompile` 乘到 `diffuseColor`
- [ ] **Step 2**:剪報卡、tag 標籤、便利貼改 `MeshStandardMaterial` + `onBeforeCompile`:把原本 `CARD_FRAG` 的上色(拼貼、遮罩、照片)放進 `diffuseColor`,把淡出 / 霧化 / 暗幕 / 素描放在輸出前;instance 屬性沿用
- [ ] **Step 3**:燈用 `roomLights`;西窗 SpotLight 放在 `sunDir('desk')` 方向約 4m、掛 `windowGobo(4, 3, …)`、投影;檯燈 SpotLight 在 `lampDir('desk')`、投影;拿掉手寫窗光與 drop shadow 平面(陰影改由陰影貼圖產生;淡出的卡不投影:`customDepthMaterial` 依 fade 丟棄)
- [ ] **Step 4**:夜間拿起的卡維持紙色(Task 4 的 ruling 照舊:hero 卡不吃檯燈明暗)
- [ ] **Step 5: 驗證**:Node 測試、建置 + htmlproofer、晝夜 × 1440 / 360 / 390 / 430 截圖(桌面層、櫃子層)、切換主題、拿起卡片換手;Playwright 在 390 寬量 2 秒的 rAF 間隔(換層動畫中)記進 ledger,跟 Task 4 版本比
- [ ] **Step 6: Commit** — `refactor(shares): 剪報桌改用 three.js 內建燈、材質與陰影`;交使用者實測

### Task 8: 地球儀(里程碑)

同原 Task 5,但燈改用 `roomLights`(西窗 SpotLight 從 `sunDir('globe')`、落地燈從 `lampDir('globe')`),跟剪報桌同一套參數;矮櫃 `--oak`、牆 `--wall`;國家色階晝夜仍分得出 5 級。

### Task 9: 書櫃(里程碑)

同原 Task 6 的 `carcass(shelves)`(含測試),場景改內建:書的 InstancedMesh 改 `MeshStandardMaterial` + `onBeforeCompile`(封面拼貼、書脊字、淡入、暗幕 / 素描照舊),櫃體與層板投影;燈用 `roomLights`(白天 `sunDir('books')` 柔光、夜間落地燈依〈還沒定〉的 A / B)。注意 `docs/books-webgl.md`〈書架效能〉:材質不能全部 dispose、`compileAsync` 預熱照舊。
