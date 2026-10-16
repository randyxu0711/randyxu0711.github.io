# Spec:板材改版(v2)

設計稿:[桌面與板材 mockup](https://claude.ai/artifact/9DESBj7BSmxcFjjRganrhz)(Version 3,本機副本 `docs/redesign/mockups/slab-site.html`,
樣式原稿 `docs/redesign/mockups/slab-site.css`)。與本文件衝突時以本文件為準。
這份取代 `SPEC.md` 裡〈元件與行為〉的視覺部分;資料、流程、模組架構不變。

## 目標

把「琥珀膠框」(外框 + 內嵌內容區的相框型)換成「**桌面與板材**」:網站是一張桌面,
卡片、書、project、按鍵都是放在上面的**同一種板材**,立體感來自板子本身的厚度。

成功的樣子:整頁安靜、內容優先;訊號色只出現在需要注意的地方;三頁(分享、書架、關於)結構與材質一致。

## 已定案的決策

| 項目 | 決定 |
|---|---|
| 卡片結構 | **一片型**:圖片貼齊頂端,內容在同一個表面;不再有框與內嵌區 |
| 立體感 | 上緣 1.5px 反光 + 底下露出的側面(厚度)+ 兩層陰影(近的實影、遠的柔影) |
| 厚度 | 精選 7px、一般卡 4px、按鍵 2px;書的厚度依頁數 |
| 訊號色(赤褐) | **只留給三個時刻**:精選卡(一直)、游標停留 / 鍵盤聚焦(側面亮成赤褐)、按下的狀態(選中的 tag、目前所在頁) |
| 平常的側面 | 暖中性色(像厚紙的切面) |
| 書的側面 | 紙色(書口),不論停留與否 |
| 傾斜 | 游標在板上時朝游標傾斜,一般 4°、精選 3°、書 6°;側面往反方向露出;觸控與「減少動態」不傾斜 |
| 導覽列 | 頁面在頂端時與桌面同色;捲動超過 8px 變成霧面玻璃(上緣反光 + 底線 + 模糊);「減少透明度」不做玻璃 |
| 語言與主題 | 收成兩顆圓鍵:語言鍵顯示「另一個語言」(中文時顯示 EN,英文時顯示 中);主題鍵循環 跟系統 → 晝 → 夜,用圖示 |
| 首頁 | **沒有頁首**,直接是篩選列 + 精選卡 + 格狀 |
| 書架頁 | **沒有大標題**;只留排法切換鍵與一行小字「書的厚度就是頁數」 |
| 關於頁 | 大標題是「Randy Xu」+ 一行定位;下面是履歷式兩欄(小標在左、內容在右);「最近關注」改名「正在研究」;技能改成分類標籤 |
| 縮圖降彩度 | 不做(mockup 裡的對照開關不帶進網站) |
| 字型 | 三種角色:內容標題宋體、內文與介面黑體、資料與程式等寬(見〈字型與配色規則〉) |

## 字型與配色規則

| 角色 | token | 字型 | 用在哪 |
|---|---|---|---|
| 內容標題 | `--font-display` | 系統襯線(Iowan / Charter / Georgia)+ 系統宋體(宋體-繁 / 新細明體),600 | 名字、project 名、書名(書脊、封面備用、封底);小標題不用,中文宋黑混在同一段會像兩種字型打架 |
| 內文與介面 | `--font-ui` | 系統字(San Francisco / Segoe UI)+ 蘋方 / 微軟正黑體 | 段落、導覽、按鍵、保底清單的卡片(3D 剪報卡的標題例外,用 `--font-display` 畫,像報紙標題) |
| 資料與程式 | `--font-code` | 系統等寬(SF Mono / Cascadia Mono / Consolas) | 程式碼、計數(`02 / 05`)、日期、版本號 |
| 簽名 | `--font-sign` | Mrs Saint Delafield(自架,`assets/fonts/`) | 只有導覽列的站名 |

- 全部用系統字型,不下載(2026-10 PageSpeed:Google Fonts 的中文字型 CSS 170KB、字型檔約 600KB,手機首次繪製被擋 3 秒以上)。
- 英文字型排在中文前面:英文字母由西文字型畫,中文退回系統的中文字型。
- 一個畫面最多三種字型(簽名不算)。宋體只給「內容的名字」,不用在介面與長段落。
- 數字一律 `tabular-nums`;大的數字(About 的 `83.6s → 20.3s`)用 `--font-ui` 粗體,不用等寬。
- 配色(2026-10-16 定稿,比較樣本 `docs/redesign/mockups/palette.html`):「老書房」。白天出自和田三造《配色事典》#249
  (Hay's Russet + Ecru + Olive Ocher + Dark Medici Blue):奶油色桌面、紙色板材、赤褐當訊號。
  夜間不用黑,用皮革棕(#113 Vandyke Brown);暗幕是近黑的深棕,檯燈有自己的 `--lamp`,不再從側面色推。
  不新增語意色(沒有成功綠、錯誤紅);資料自帶的顏色(書封、書脊)與專案截圖例外,截圖不調色,靠板材的裱框統一。
- tag 顏色:`--tag-1`～`--tag-8`(色相與深淺拉開),依出現次數分配,最常用的 8 個不撞色;來源章用名稱雜湊。
- favicon:白文印(Carmine Red `#a62c37` 實心方印,R 刻成留白,Noto Serif CJK Bold 的字形轉路徑);系統深色時 `#d4664f`。
  16px 先設計、單一輪廓、不用細線(外框細線的朱文印在 16px 會黏住)。

## Token

`assets/css/tokens.css`,數值直接寫色碼(來源是事典的色碼)。第 1 層只剩厚度與字型。

| Token | 用途 | 晝 | 夜 |
|---|---|---|---|
| `--desk` / `--desk-2` | 桌面 / 刻進桌面的凹槽 | `#e9dfcb` / `#ddd1b9` | `#221812` / `#1a120d` |
| `--face` | 板材表面 | `#f7f0e1` | `#30241b` |
| `--face-sig` | 精選卡表面、按下的鍵 | `#efdcd6` | `#3d2a1f` |
| `--edge` / `--edge-deep` | 訊號側面 / 側面最下緣 | `#a8574a` / `#793327` | `#a8623c` / `#6e3a22` |
| `--edge-n` / `--edge-n-deep` | 平常的側面、櫃子 | `#cdb999` / `#a8957a` | `#4b3827` / `#3a2b1f` |
| `--paper` / `--paper-deep` | 書口 | `#f0e6cf` / `#d6c6a6` | `#cdbb9c` / `#9a8668` |
| `--ink` `--ink-2` `--ink-3` | 文字三階 | `#2a1f19` / `#4a3d35` / `#5c4f45` | `#f0e3cc` / `#c9b8a0` / `#a8957d` |
| `--accent` | 當成文字的訊號色 | `#793327` | `#e3a07c` |
| `--unlit` / `--lamp` | 夜間暗幕 / 檯燈 | `#0c0806` / `#e6bc8a` | 同左 |
| `--tag-1`～`--tag-8` | 標籤 | Etruscan 紅、Medici 藍、Ocher、綠、紫褐、Salvia 藍、Russet、肉桂 | 各調亮一階 |

## 材質(`assets/css/slab.css`,取代 `gel.css`)

| class | 是什麼 | 要點 |
|---|---|---|
| `.slab` | 板 | `--th` 厚度、`--side`/`--side-2` 側面色(預設中性)、`--face-c` 表面;`::before` 畫上緣反光(蓋在圖片上)、`::after` 畫跟游標的光澤;hover / focus-visible 時 `--lift: -4px` 且側面換成訊號色 |
| `.slab[data-tilt]` | 會傾斜的板 | 值是最大角度;JS 設定 `--rx --ry --sx --mx --my`,離開時清掉 |
| `.key` | 按鍵 | 2px 中性側面;`aria-pressed="true"` 時沉下去(厚度 0、`translateY(2px)`)、表面換 `--face-sig`、內框訊號色 |
| `.key.round` | 圓鍵(導覽列) | 2rem 正圓,放文字或 16px 圖示 |
| `.groove` | 凹槽(輸入框) | `--desk-2` 底、內陰影;**不要叫 `.well`**(舊材質的名字,避免混淆) |
| `.coin` | 圓形頭像 | 4px 中性側面 |
| `.board` | 書架的層板 | 6px 中性側面的長條板 |

傾斜邏輯放在 `assets/js/slab.js`(全站載入,取代 `theme.js` 裡的游標高光);主題與語言鍵的邏輯也併進來或留在各自檔案皆可,但只能有一份。

## 各頁

**導覽列**(`_includes/nav.html`):站名、三個頁籤(目前頁底下 3px 訊號色條)、右側兩顆 `.key.round`。
語言鍵的文字與 `aria-label` 走 i18n;主題鍵的 `aria-label` 寫出目前狀態與「點一下切換」。捲動玻璃由 JS 加 `.glass`。

**首頁**(`_layouts/home.html` + shelf-filter):篩選列 = `.groove` 輸入框 + tag `.key` + 數量 + `?` 圓鍵;
精選卡 `.slab.share.feature`(7px、訊號色表面與側面、`data-tilt="3"`),其餘 `.slab.share`(4px、`data-tilt="4"`)。
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
