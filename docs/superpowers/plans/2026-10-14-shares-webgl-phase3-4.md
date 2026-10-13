# 分享頁 WebGL 版 階段 3–4:互動與收尾 Implementation Plan

> 使用者指示(2026-10-14):直接做到收尾;計畫寫成任務清單與驗收條件(不貼完整程式);程式由主控直接寫,
> 可獨立的部分交給子代理;code review 只做一次(全部完成後一位最強模型審整個分支,修正後收尾)。
> 只在本機分支 `shares-webgl` commit,不 push;做完交給使用者用 Docker 測桌機,上線前先問。

**Goal:** 分享頁可以點、可以讀:拿起卡片換成 HTML 卡、攤開週疊、拉開抽屜撥卡、焦點燈光與淡出、提示列;加上開場、搜尋、已開過 / 封存記號、
無障礙連動,最後取代首頁。

**Spec:** `docs/shares-webgl.md`。**前一階段的結轉項目**(phase 2 最後審查留下的):atlas anisotropy 設定時機、catch 沒印錯誤、
`cameraAt` 每格重算、手機側邊留白只有 1%。

## Global Constraints
- 書架行為不變;元件 CSS 只用 token;介面文字只在 `_data/i18n.yml`;不寫註解;import 用裸名稱。
- 首次繪製就要正確;沒有 JS / WebGL 失敗時保底清單照常可用。
- 靜止時不重畫;開燈前不給互動回饋。
- 純函式(位置、撥卡角度、搜尋比對、提示列文字選擇)放 `layout.js` 等純模組並用 `node:test` 測。

## 介面(各任務共用)

- `layout.js` 新增(純函式):
  - `spreadPoses(n, base, a) → [{x,y,z,ry}]`:攤開的一疊,4 張一排(窄螢幕 2 張),浮在桌面上方 y≈18,在那一疊前方。
  - `drawerOut(cab, k) → {x,y,z}`:拉開的抽屜面板位置(往前拉 DEPTH − 50)。
  - `drawerCards(n, cur) → [{y,z,rx}]`(抽屜座標):`k < cur` 往前倒 0.62 rad、其餘後靠 −0.35,以底邊為軸、互相平行,前面留 55mm。
  - `focusCamera(kind, target, aspect, a) → {pos, look}`:`'pile'` 俯看攤開的卡、`'drawer'` 約 50° 俯看抽屜內。
  - `matches(item, q) → boolean`:標題 / 來源 / 心得 / 摘要,不分大小寫、空白分詞全中。
  - `makeCamera(aspect, a) → (p) => {pos, look}`:把 `cameraAt` 的 fit 結果快取起來。
- `scene.js` 新增:
  - 每個 instance 的淡出 `iFade`(卡、色標、便利貼跟著卡;抽屜面板、把手各自),取代全域 `uDim` 的用途。
  - `iHot`(抽屜面板):琥珀側面與標籤框;卡片停留時抬起由 main 調整 y。
  - 抽屜內部:`setTray(pose | null)`(拉開的那格的底、側板、背板)。
  - `setHeld(item | null)`:單獨一張卡(清深度後畫,同書架),`item` 同 `setCards` 項目 + `scale`。
  - `pick(x, y) → {kind:'card', index} | {kind:'drawer', index} | null`(櫃身擋住後面)。
- `held.js`(子代理寫,新檔):`createHeld(root, t) → { show(item, rect?), hide(), flip(), step(dir, item), el, target() → DOMRect, onAction(cb) }`
  —— HTML 卡:正面同 3D 卡的版面(container query 單位)+ og:image 剪報(hotlink、失敗就不顯示)、背面心得 / 摘要 / tag / 也收在、
  按鈕 ‹ 翻面 開原文 放回去 ›、左右滑、← →、Esc;`role="dialog"`。樣式在 `held.css`。
- `hint.js`(子代理寫,新檔):`createHint(el, t) → { set(stage, count, coarse) }`,`hintFor(stage, coarse) → [[key, text]]` 純函式可測。

## 任務

### 階段 3
1. **結轉修正**:anisotropy 放進 render target 建立時;`run()` 的 catch `console.error`;`makeCamera` 快取(resize / rearrange 才重算);
   窄螢幕 fit 邊距 0.96。驗收:Node 測試、建置通過;`cameraAt` 舊測試照過。
2. **淡出與焦點燈光**:`iFade` 每 instance;狀態(desk / pile / cab / drawer / held)決定淡出目標與檯燈位置(spec〈燈光〉表格);
   最新那張卡側面琥珀(精選)。驗收:晝夜各狀態手動看;靜止不重畫。
3. **點選與停留**:`pick`;桌上 / 週疊卡停留抬起 4mm;抽屜停留往外 10mm + 琥珀;游標樣式;開燈前不反應。
4. **攤開週疊**:點收起的疊 → 攤開(其他收回),鏡頭對準;捲動 > 140px 或 Esc 收回;攤開的卡要貼正面(atlas.want)。
5. **抽屜與撥卡**:點抽屜 → 拉出、鏡頭俯看;抽屜內卡片(最多 60)直立、色標交錯;游標往上掃 / ↑↓ jk 撥卡、Enter 拿起、Esc 關;
   觸控點一下撥到、再點拿起;放回時停在最後看的那張。
6. **HTML 卡(子代理寫 held.js / held.css)+ 拿起流程(主控)**:3D 卡飛到 HTML 卡的螢幕矩形後淡入換手;翻面;換一張(範圍依來源:
   桌上 / 那一疊 / 那格抽屜,抽屜同步撥卡);開原文記入 seen;放回飛回原位。
7. **提示列(子代理寫 hint.js)+ 停留標題**:底部固定,依狀態換文字與張數;觸控說法;分組鍵在櫃子段出現。

### 階段 4
8. **開場**:接 `scene3d/intro.js`(暗房 / 素描);桌上卡片貼好(300ms–1.5s)才開燈;開燈前不互動、提示列不出現。
9. **搜尋**:`/` 或提示列按鈕開 `.groove` 輸入框;不符合的淡出;抽屜標籤「3 / 12」;撥卡與換一張只在符合的卡間跳;`#tag-…` 開抽屜。
10. **已開過 / 封存記號**:資料加 `l`(原文連結);seen(localStorage `seen-links`)→ 卡片角落鉛筆勾;封存 → 印章換成紅色「封存」;
    footer「清除已開過」後重畫。
11. **無障礙連動與 reduced motion**:保底清單 Tab 到一張 → 場景高亮並移過去(必要時開抽屜撥到),Enter 拿起;reduced motion 一律直接到位。
12. **取代首頁**:`index.html` 改用 shares 版面;刪 `shares-3d.md`;`shelf-filter` 模組關掉(搜尋取代);更新 CLAUDE.md、`docs/shares-webgl.md`、
    `docs/redesign/SPEC.md` 相關段落。

### 收尾
13. **整體審查**(一位最強模型)→ 一次修正 → 交給使用者 Docker 測桌機 → 上線前詢問。
