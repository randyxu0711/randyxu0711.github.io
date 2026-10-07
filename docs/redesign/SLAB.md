# Spec:板材改版(v2)

設計稿:[桌面與板材 mockup](https://claude.ai/artifact/9DESBj7BSmxcFjjRganrhz)(Version 3,本機副本 `docs/redesign/mockups/slab-site.html`,
樣式原稿 `docs/redesign/mockups/slab-site.css`)。與本文件衝突時以本文件為準。
這份取代 `SPEC.md` 裡〈元件與行為〉的視覺部分;資料、流程、模組架構不變。

## 目標

把「琥珀膠框」(外框 + 內嵌內容區的相框型)換成「**桌面與板材**」:網站是一張桌面,
卡片、書、project、按鍵都是放在上面的**同一種板材**,立體感來自板子本身的厚度。

成功的樣子:整頁安靜、內容優先;琥珀色只出現在需要注意的地方;三頁(分享、書架、關於)結構與材質一致。

## 已定案的決策

| 項目 | 決定 |
|---|---|
| 卡片結構 | **一片型**:圖片貼齊頂端,內容在同一個表面;不再有框與內嵌區 |
| 立體感 | 上緣 1.5px 反光 + 底下露出的側面(厚度)+ 兩層陰影(近的實影、遠的柔影) |
| 厚度 | 精選 7px、一般卡 4px、按鍵 2px;書的厚度依頁數 |
| 琥珀 | **只留給三個時刻**:精選卡(一直)、游標停留 / 鍵盤聚焦(側面亮成琥珀)、按下的狀態(選中的 tag、目前所在頁) |
| 平常的側面 | 暖中性色(像厚紙的切面) |
| 書的側面 | 紙色(書口),不論停留與否 |
| 傾斜 | 游標在板上時朝游標傾斜,一般 4°、精選 3°、書 6°;側面往反方向露出;觸控與「減少動態」不傾斜 |
| 導覽列 | 頁面在頂端時與桌面同色;捲動超過 8px 變成霧面玻璃(上緣反光 + 底線 + 模糊);「減少透明度」不做玻璃 |
| 語言與主題 | 收成兩顆圓鍵:語言鍵顯示「另一個語言」(中文時顯示 EN,英文時顯示 中);主題鍵循環 跟系統 → 晝 → 夜,用圖示 |
| 首頁 | **沒有頁首**,直接是篩選列 + 精選卡 + 格狀 |
| 書架頁 | **沒有大標題**;只留排法切換鍵與一行小字「書的厚度就是頁數」 |
| 關於頁 | 大標題是「Randy Xu」+ 一行定位;下面是履歷式兩欄(小標在左、內容在右);「最近關注」改名「正在研究」;技能改成分類標籤 |
| 縮圖降彩度 | 不做(mockup 裡的對照開關不帶進網站) |
| 字型 | 維持 Noto Sans TC + 系統字型 |

## Token

`assets/css/tokens.css`(第 1 層數值仍由 `_config.yml` 的 `appearance` 注入)。語意 token 換成下表,舊的
`--ground* --well* --resin* --edge-hi --edge-lo --edge-line --glow --sheen --drop --chip` 全部移除。

| Token | 用途 | 晝 | 夜 |
|---|---|---|---|
| `--desk` | 桌面(頁面底色) | `oklch(0.925 0.007 250)` | `oklch(0.165 0.008 250)` |
| `--desk-2` | 刻進桌面的凹槽 | `oklch(0.89 0.009 250)` | `oklch(0.135 0.008 250)` |
| `--face` | 板材表面 | `oklch(0.985 0.004 85)` | `oklch(0.235 0.008 75)` |
| `--face-amber` | 精選卡表面、按下的鍵 | `oklch(0.955 0.045 80)` | `oklch(0.28 0.04 70)` |
| `--edge` / `--edge-deep` | 琥珀側面 / 側面最下緣 | `oklch(0.76 0.13 H)` / `oklch(0.6 0.12 62)` | `oklch(0.6 0.13 66)` / `oklch(0.4 0.09 60)` |
| `--edge-n` / `--edge-n-deep` | 平常的側面(暖中性) | `oklch(0.83 0.018 75)` / `oklch(0.71 0.022 70)` | `oklch(0.37 0.012 75)` / `oklch(0.28 0.01 70)` |
| `--paper` / `--paper-deep` | 書口 | `oklch(0.94 0.025 85)` / `oklch(0.82 0.03 80)` | `oklch(0.8 0.03 85)` / `oklch(0.62 0.03 80)` |
| `--ink` `--ink-2` `--ink-3` | 文字三階 | `0.22 / 0.47 / 0.6`(彩度 ~0.015,色相 70) | `0.93 / 0.72 / 0.58`(色相 80) |
| `--accent` | 當成文字的琥珀 | `oklch(0.52 0.12 65)` | `oklch(0.8 0.14 H)` |
| `--line` | 細線、板的輪廓 | `oklch(0.45 0.03 70 / 0.14)` | `oklch(0.9 0.03 80 / 0.08)` |
| `--spec` / `--sheen` | 上緣反光 / 跟游標的光澤 | 白 0.95 / 白 0.55 | `oklch(0.95 0.04 80 / 0.3)` / `oklch(0.95 0.08 H / 0.3)` |
| `--drop-near` / `--drop-far` | 近陰影 / 遠陰影 | `oklch(0.25 0.03 250 / 0.24)` / `0.22` | 黑 0.55 / 0.6 |

`H` = `appearance.hue`(預設 72)。桌面色相 250 寫成第 1 層的 `--desk-h`。

## 材質(`assets/css/slab.css`,取代 `gel.css`)

| class | 是什麼 | 要點 |
|---|---|---|
| `.slab` | 板 | `--th` 厚度、`--side`/`--side-2` 側面色(預設中性)、`--face-c` 表面;`::before` 畫上緣反光(蓋在圖片上)、`::after` 畫跟游標的光澤;hover / focus-visible 時 `--lift: -4px` 且側面換成琥珀 |
| `.slab[data-tilt]` | 會傾斜的板 | 值是最大角度;JS 設定 `--rx --ry --sx --mx --my`,離開時清掉 |
| `.key` | 按鍵 | 2px 中性側面;`aria-pressed="true"` 時沉下去(厚度 0、`translateY(2px)`)、表面換 `--face-amber`、內框琥珀 |
| `.key.round` | 圓鍵(導覽列) | 2rem 正圓,放文字或 16px 圖示 |
| `.groove` | 凹槽(輸入框) | `--desk-2` 底、內陰影;**不要叫 `.well`**(舊材質的名字,避免混淆) |
| `.coin` | 圓形頭像 | 4px 中性側面 |
| `.board` | 書架的層板 | 6px 中性側面的長條板 |

傾斜邏輯放在 `assets/js/slab.js`(全站載入,取代 `theme.js` 裡的游標高光);主題與語言鍵的邏輯也併進來或留在各自檔案皆可,但只能有一份。

## 各頁

**導覽列**(`_includes/nav.html`):站名、三個頁籤(目前頁底下 3px 琥珀條)、右側兩顆 `.key.round`。
語言鍵的文字與 `aria-label` 走 i18n;主題鍵的 `aria-label` 寫出目前狀態與「點一下切換」。捲動玻璃由 JS 加 `.glass`。

**首頁**(`_layouts/home.html` + shelf-filter):篩選列 = `.groove` 輸入框 + tag `.key` + 數量 + `?` 圓鍵;
精選卡 `.slab.share.feature`(7px、琥珀表面與側面、`data-tilt="3"`),其餘 `.slab.share`(4px、`data-tilt="4"`)。
卡片內:來源與日期(`--ink-3`)、標題、心得(`--ink`)或摘要(`--ink-2`,3 行)、tag(只有細輪廓,不填色)。

**書架頁**(`_layouts/books.html` + books 模組):頁首只有一行說明(左)與排法 `.key`(右)。
封面 = `.slab.book`,2:3,厚度 `clamp(3px, pages / 110, 9px)`(pages 為 null 用 4px),側面是紙色,`data-tilt="6"`;
書名作者在板子下方。書脊 = 立著的 `.slab.spine`,站在 `.board` 上。翻開的書 dialog 的卡片也改成板。

**關於頁**(`_tabs/about.md`):
- 頁首:`.coin` 頭像 + `<h1>Randy Xu</h1>` + 一行定位(`--accent`)+ 一段自介(`--ink-2`)。
- 下面是 `.cv`:每列 `.cv-row` = 左欄小標(`--ink-3`,小字)+ 右欄內容;≤760px 變上下排列。
- 列的順序:正在研究、Projects、經歷、技能、學歷。Projects 是 `.slab.proj`;技能是 `<dl>`,每類一列細輪廓標籤。
- 中英兩份照舊用 `.lang-zh` / `.lang-en`。

新的文字(中 / 英):
- 定位:「軟體工程師,正在研究 AI agent」/「Software engineer, currently exploring AI agents」
- 自介(合併原本兩段):「曾在 Openfind 擔任 Software Engineer,現在大部分時間用 Claude Agent SDK 做自己想用的工具。工作之外,喜歡讀世界經典文學。這裡放我的 projects、讀到值得一看的技術文章,還有讀過的書。」/
  「I previously worked as a Software Engineer at Openfind. These days I spend most of my time building tools I actually want to use with the Claude Agent SDK. Outside of code, I read a lot of world classic literature. This site holds my projects, technical articles worth your time, and the books I've read.」
- 小標:正在研究 / Currently exploring;經歷 / Experience;技能 / Skills;學歷 / Education

**i18n 新增鍵**:`lang.switch_to`(切換成英文 / Switch to Chinese)、`theme.cycle`(主題:{狀態},點一下切換 / Theme: {state}, click to change)、
`books.note`(書的厚度就是頁數。/ A book's thickness is its page count.)。不再需要的鍵(如 `nav.books` 當頁面標題用)保留,因為導覽列還在用。

## 不變的

資料格式、share / books / linkcheck 工具、模組與插槽架構、中英切換機制、沒有 JS 時可用、`[hidden]` 規則、封存與已開過的行為。
已開過的卡片:改成表面稍微變淡(`opacity: 0.72` 加標題用 `--ink-2`),不再改框色。失效卡片的標示不變。

## 邊界

- 一定要:元件只用語意 token;所有動態效果有「減少動態」退路;玻璃有「減少透明度」退路;沒有 JS 時篩選鍵與切換鍵維持 hidden。
- 先問:換字型、改資料格式、拿掉任何模組。
- 不做:縮圖降彩度、在 mockup 以外新增裝飾(紋理、漸層背景)。

## 成功條件

1. 建置 + htmlproofer 通過;`grep -r "gel\b\|\.well\b\|--resin" assets _includes _layouts` 沒有舊材質殘留。
2. headless 檢查(jsdom):主題鍵循環三種狀態且記住;語言鍵切換後顯示另一個語言;捲動 > 8px 導覽列有 `.glass`、回到頂端移除;
   tag 鍵 `aria-pressed` 切換;既有的 33 項中英切換檢查仍通過。
3. 逐一註解掉每個模組,建置照樣成功。
4. Randy 在 Brave 對照 mockup 確認:晝夜、桌機與手機寬、游標傾斜、捲動玻璃、三頁一致。
