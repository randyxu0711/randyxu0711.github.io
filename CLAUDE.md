# CLAUDE.md — randyxu0711.github.io

個人首頁 + 技術文章轉發站 + 書單,跑在 GitHub Pages(`https://randyxu0711.github.io`)。
**不寫文章**;內容是「別人的技術文章(連結+縮圖+選填心得)」,credit 屬於原作者。
設計與決策的完整紀錄:`docs/redesign/SPEC.md`(規格)、`docs/redesign/PLAN.md`(實作計畫)、`docs/redesign/SLAB.md`(v2 板材視覺)。

## 架構
- **Jekyll 4.4,不用主題**,版面全部自己寫。GitHub Actions 部署(`pages-deploy.yml`)。
  本機無 Ruby,用 Docker 建置(指令見 `docs/redesign/SPEC.md`〈指令〉)。
- **三層 token**:`_config.yml` 的 `appearance`(模式、厚度)→ `assets/css/tokens.css`(Liquid 注入,晝夜兩套語意 token;
  配色是「老書房」:白天和田三造《配色事典》#249 的奶油與赤褐,夜間皮革棕,規則見 `docs/redesign/SLAB.md`)
  → 元件。**元件 CSS 只引用語意 token,不寫色碼**(書脊 / 封面的顏色來自資料,例外)。
- **桌面與板材**(`assets/css/slab.css`):頁面是桌面(`--desk`),卡片、書、project、按鍵都是 `.slab` 板;
  立體感 = 上緣反光 + 底下側面(`--th` 厚度)+ 兩層陰影。另有 `.key`(按鍵,按下沉進桌面)、`.groove`(輸入框凹槽)、
  `.coin`(圓形頭像)。**訊號色(赤褐)只用在三個時刻**:精選卡、游標停留 / 鍵盤聚焦(側面亮成訊號色)、按下的狀態;
  平常的側面是暖中性色,書的側面是紙色。`data-tilt` 的板會朝游標傾斜(`assets/js/slab.js`,也管導覽列捲動後的陰影與主題鍵)。
  導覽列底色不透明、不用 `backdrop-filter`(每格都要重算底下的 3D 書架,iPhone 捲動會卡)。
- **模組與插槽**:`_config.yml` 的 `modules:` 一行一個模組,註解掉就關掉。版面用 `{% include slot.html name="…" %}`
  預留插槽(`header-tools` / `before-shelf` / `after-shelf` / `card-meta` / `footer`),
  模組片段在 `_includes/modules/<m>/<slot>.html`,樣式與 JS 在 `assets/modules/<m>/<m>.{css,js}`(每頁都載入;模組設 `assets: false` 就不載入)。
  目前的模組:`seen`(已開過)、`archive`(失效改連封存版)、`books`(書單頁);`shelf-filter`(原地篩選)已關掉,分享頁由場景裡的搜尋取代。
- **字型三種角色**:`--font-display`(宋體,只給內容的名字:姓名、project、書名;小標題用黑體)、`--font-ui`(系統黑體)、
  `--font-code`(系統等寬,程式碼與計數),都用系統字型、不下載(Google Fonts 的中文字型拖慢首次繪製);只有簽名字型自架在 `assets/fonts/`。規則見 `docs/redesign/SLAB.md`〈字型與配色規則〉。
- **About 頁是捲動敘事**(`_includes/about.html`、`assets/css/about.css`、`assets/js/about.js`):每個 project 左邊是固定的展示台、
  右邊一步一則 `story`。截圖嵌在板子裡(裱框),連續幾步用同一張圖時不換板子,只移動鏡頭(`focus: x y 倍率`);
  程式碼放文字欄的 `.groove`,數字放標題上方的大字,展示台只放真畫面。首頁卡片捲進畫面時「放上桌」、換頁有 View Transition,
  都只動 transform / opacity,書架不套(3D 會被壓平)。
  整頁是「書房主人的卷宗」(求職讀者優先):封面紙板(自介、email / GitHub / Goodreads、白文印)→ Projects → 履歷紙(經歷、技能、學歷,上緣索引標籤)
  → 書房近況(研究方向便利貼 + 最近轉發 3 篇 + 最近讀完 3 本)。寬螢幕(≥ 85rem)左側有段落捲軸(閱讀進度 + 跳轉),手機不做。
  技能只寫認得出的工具與業界術語(Tool use、Structured output、MCP、Evals、RAG…),做法交給 project 敘事證明。
- **版面不寫個人資料**:名字、自介、導覽在 `_config.yml`,projects 在 `_data/projects.yml`,自介全文在 `_tabs/about.md`。
- 沒有 JS 時卡片與連結照樣能用;模組的控制項先 `hidden`,JS 啟動後才顯示(全站有 `[hidden] { display: none !important }`)。
  控制項加 `data-reserve` 的話,有 JS 時(head 給 `<html>` 加 `.js`)先看不見但佔好位置,啟動時版面不會跳。
  **首次繪製就要正確**:會影響版面的狀態(主題、語言、書架排法)在繪製前由行內 script 決定,不要等 defer 的 JS 再改。
- 只用 tags,不用 categories。
- **中英切換**(全站):介面文字只寫在 `_data/i18n.yml`(`zh` / `en`,英文單數用 `en_one`)。版面標 `data-i18n="鍵"`
  (屬性用 `data-i18n-attr="屬性:鍵"`,數字用 `data-i18n-n`),預設中文由 `{% include t.html k="鍵" %}` 輸出;
  `assets/js/i18n.js` 依 `<html data-lang>` 換字,模組用 `window.siteI18n.t()` 並監聽 `langchange`。
  整段內容(About、404)寫 `.lang-zh` / `.lang-en` 兩份,CSS 只顯示一份。share 的標題與心得不翻譯。
  `t.html` 的 `{n}` 要先在 tag 裡 assign:Liquid 的 `{{ }}` 遇到單一個右大括號就會當成結尾。

## 一則 share = 一個 `_posts/<date>-share-<issue#>.md`
front matter:`title`(og:title)/ `link`(原文)/ `archive`(Wayback 最新快照網址)/ `source`(網域)/
`description`(og:description)/ `image`(og:image,hotlink 不存 repo)/ `note`(心得,選填)/ `tags` / `issue`。
- **所有列出 share 的地方都直接開原文、另開分頁**。
- **首頁是 WebGL 剪報桌與目錄櫃**(規格 `docs/shares-webgl.md`,開頭的 v2.1、v2 段優先;版面 `_layouts/shares.html`,程式 `assets/shares3d/`,共用 `assets/scene3d/`):
  **不捲動,分三層**:剪報桌(俯角 55°,最新 6 張平放、全部看得到,點一下就拿起)→ `↑` / 往上滾 / 手機往下拉 抬頭看目錄櫃(只依 tag 分組,抽屜不拆格,超過 60 張只放翻到附近的 60 張、跟著滑;格子不要多,細找靠搜尋)→
  點抽屜拉開撥卡(前面的往前倒,滾輪撥)。`Esc` / `↓` / 瀏覽器上一頁退一層(`pushState`,tag 抽屜網址 `#tag-名稱`)。
  **操作要單純**(本質是讀卡片):點一下就拿起(抽屜與卡疊的觸控兩段),點空白處退一層,點標籤 = 直接讀這張、同 tag 的卡疊在後面(拿著時 ← → / 滾輪在這個 tag 裡換,放回去就回桌面);
  **不放提示句**(介面自己說清楚;撥卡靠拉開抽屜時的示範動畫),提示列只留第幾張 / 共幾張,鍵盤操作收在 `?` 鍵。點擊層 `.sh3d-stage` 必須鋪滿畫面(以前只有內容欄寬,寬螢幕兩側點不到)。
  - **剪報卡**:上方 og:image 經 wsrv.nl 轉 webp(帶 CORS)貼進第二張拼貼貼圖,圖到了才淡入,場景不等;下方標題兩行、來源章、日期、編號
    畫成遮罩(R 標題、G 次要文字、B 印章)在 shader 裡上色。上緣每個 tag 一片標籤(最多 3 片),抽屜面的色條同色(`--tag-1`～`--tag-8`,依出現次數分配,程式不列 tag;來源章用名稱雜湊)。
    心得便利貼、已開過的勾、封存的紅章。
  - 頁面不捲動(舞台一個畫面高),footer 固定成工具列下面的一行(後面有 `--desk` 漸層底)。桌面是頁面底色,櫃子與抽屜同書架的暖中性色。
  - 拿起 = 3D 卡飛到 `held.js` 的 HTML 卡位置後換手(同版面的剪報卡);翻面看心得 / 摘要;← → / 左右滑換一張。
  - 主角之外淡出、夜間檯燈跟著主角走;底部提示列(`hint.js`)與換層按鈕。`/` 搜尋:背景霧化,符合的卡疊成牌疊左右翻。
  - 純函式在 `layout.js`(桌上 / 分組 / 櫃子 / 鏡頭 / 撥卡 / 搜尋 / 縮圖網址),用 `node:test` 測(`tools/shares3d/`)。窄螢幕(直立)桌面與櫃子改 2 欄。
  - **保底**:`share-card.html` 的格狀清單(縮圖磁磚 + 停留浮出心得)照常輸出,沒有 JS / WebGL 失敗時顯示;有 JS 時視覺隱藏,Tab 到一張 = 場景裡移過去,Enter 拿起。
- og:title 結尾重複的網站名稱(「 - 網站名」「 | Blog | 網站名」)由 `share.py` 的 `clean_title` 拿掉;issue 填的標題覆蓋不動。
- **share 不產生內部頁**:`_plugins/no-post-output.rb`(`collections.posts.output: false` 在 Jekyll 無效)。
- 摘要:有 note 顯示 note,否則 description。縮圖載入失敗就移除。

## 發文 = 開 GitHub Issue
- Issue Form `.github/ISSUE_TEMPLATE/share.yml`:網址(必填)/ 心得 / tags(多選,至少一個)/ 標題覆蓋。
  **tag 清單只有這一份**,最多 8 種(目錄櫃 4 欄 / 手機 2 欄排滿、`--tag-1`～`--tag-8` 一色一類),加 tag 要先拿掉一個。
- Workflow `.github/workflows/share.yml` → `tools/share/share.py`(純 stdlib):
  作者≠owner 略過 → 網址格式不對或沒選 tag:不發布、留言 + `needs-fix` → 網址分享過(`normalize_url` 比對):不發布、留言指出 issue、關成 not planned → 抓 og(失敗不擋,退回用網址當標題並在留言提醒)
  → 寫 md(含 `archive`)、commit → 送存 Wayback(失敗不擋,只在留言提醒)→ 呼叫部署 → 留言列出抓到的內容並關 issue。
  - 編輯 issue 會重跑覆蓋;關成 **not planned** → 撤下。關成 completed(Action 自己關的)不動作。
  - **GITHUB_TOKEN 的 push 不會觸發其他 workflow**,所以 share.yml / linkcheck.yml 用 `workflow_call` 直接呼叫部署。
- 電腦端 bookmarklet 見 README。iPhone 捷徑暫不做。

## 失效連結
- `linkcheck.yml` 每週一跑 `tools/linkcheck/linkcheck.py`:404 / 410 / DNS 失敗算一次 strike,**連續兩次**才算失效;
  403 / 429 / 5xx / 逾時不算。狀態在 `_data/linkcheck.json`(只記 strikes > 0 的),有變才 commit 並部署。
- 失效且有 `archive` 的卡片改連封存版並標示。

## 書單
- 資料來源是 Goodreads 匯出的 CSV,**在本機**跑 `bash tools/books/run.sh` 轉成 `_data/books.json`
  (封面網址與主色快取在 `_data/book_covers.json`),commit 這兩個檔。
- **CSV 永遠不進 repo**(含 Private Notes、心得、想讀清單):放在 `/books/`,已 gitignore,`_config.yml` 也排除。
- 只輸出 read 書架、不在 `books.hide_shelf` 的書;輸出永遠不含 Private Notes 與 My Review。
- 不抓 Goodreads 的 RSS(`robots.txt` 禁止 `/review/list_rss`)。封面**先用 ISBN 組 Amazon CDN 網址**(`m.media-amazon.com/images/P/<ISBN10>.01.L.jpg`,
  佔位圖不算),沒有 ISBN 或 Amazon 沒圖才抓書頁 `/book/show/<id>` 的 og:image。**Goodreads 書頁不要連續大量抓**:
  AWS WAF 很快就回 202 空白頁擋下,一擋就是幾小時。
- 書單是空的或 books 模組關掉時,`_plugins/books-page.rb` 不產生 `/books/`,導覽列也不顯示。
- **3D 書架是 WebGL**(three.js r170,放在 `assets/vendor/three/`;規格與決策紀錄 `docs/books-webgl.md`):
  `_layouts/books.html` 輸出書的 JSON、一份純 HTML 書單、工具列;程式在 `assets/books3d/`,只有這頁用 import map 載入。
    跟其他場景頁共用的零件在 `assets/scene3d/`(`anim.js`、`colors.js`、`intro.js` 開場亮度曲線、`glsl.js` 打光 / 素描 / 暗房 shader 片段、
    `geometry.js` 的 `box()`、`scene3d.css` 開場幕);版面 front matter 的 `shared:` 列出要載入的共用模組,import 一律用裸名稱 `scene3d/…`。
  books 模組設 `assets: false`,不在每頁載入 `assets/modules/books/`。
  - 檔案:`layout.js`(五種排序與分組 → 每本書的位置、索引軌段落、層裡看得到哪幾本,純函式,`tools/books3d/` 測)、`scene.js`(場景、shader、鏡頭、點擊判定)、
    `textures.js`(封面拼貼貼圖、書脊字貼圖、封底)、`main.js`(狀態、動畫、互動)。
  - 書是一個 InstancedMesh,一次繪製;厚度 = 頁數 ÷ 11、高度 = 封面寬 ÷ `ratio`。顏色從 token 讀(1px canvas 填色再讀像素),主題切換時重讀。
    夜間模式自動開檯燈(跟著游標,拿起書時移到書前上方)。
  - 頁面照常捲動,鏡頭跟著捲動位置;分組排序(星等、年份)每組一條長層板,比畫面寬時層板自己左右滑,
    層標題顯示畫面裡是第幾本到第幾本 / 共幾本(`inView`)與一條細線。年份不到 12 本的跟相鄰的小年份併成區間。
    右緣有索引軌:目前排序的段落(`sections`),每段長度與本數成比例,點 / 拖曳就捲過去,標籤只在停留、拖曳、聚焦時浮出。
    陳列時鏡頭比直立遠(`viewSpan`,手機一層 3 本封面)。換排法 / 排序以畫面中央那本書為錨點。**靜止時不重畫**(`invalidate()` 才排下一格)。
  - **純 HTML 書單**:有 JS 時從首次繪製就藏起來,WebGL 啟動後改成視覺隱藏、給螢幕閱讀器與鍵盤(Tab 到一本 = 場景裡高亮);
    WebGL 開不起來、模組抓不到或執行丟錯(`.fail`,`books.html` 的行內 script 接 `error` 事件)才顯示;
    網路慢就一直蓋著幕等,**不用計時器猜**(以前 4 秒放棄,慢網路會先閃書單再跳成 3D)。
  - **開場**(過場的重點:不讓人覺得在 loading,也不露出「只是空模型」):有 JS 時書架區一開始蓋著幕(`.s3d::before`,`assets/scene3d/scene3d.css`)。
    夜間是暗幕(`--unlit`),場景畫出第一格時(`.live`)交給 shader 的 `uUnlit`(同顏色同濃度,接手看不出來),暗房裡只看得到形體;
    白天幕是桌面色,場景以墨線素描淡入(`uSketch`,`--ink` 線條、面的邊框)。畫面裡的封面貼好(至少 300ms、最多 1.5 秒)就開燈(`.lit`):
    夜間檯燈閃兩下、白天顏色從畫面中央暈開。**開燈前檯燈、停留、撥書、拿起、層板滑動都不反應**,工具列、層標題、箭頭也不出現。
    封面與書脊字一律淡入。每次載入都開場;封面在 300ms 內就到齊(快取)時播短版(夜間閃一下、白天暈開 0.6 秒)。
  - 封面先載 `._SX150_` 畫進拼貼貼圖,拿起時那本換 `._SX400_`。Amazon CDN 回 `access-control-allow-origin: *`,圖片要 `crossOrigin = 'anonymous'`。
  - 書脊字畫在 2D canvas 再上傳;字級規則同 `_plugins/spine-length.rb`(建置時算好書名長度)。換語言時重畫。
- **書架效能**(改之前先看):
  - **貼封面用的材質不能全部 dispose**:three.js 在沒有材質用某個 shader 時會刪掉它,下一批又得重新編譯(曾經因此載入時卡了 20 幾次)。
  - 封面拼貼貼圖的縮圖鏈(mipmap)最多每 0.5 秒重算一次、貼完再算一次,不要每批都算(那張圖 4096 寬)。
  - shader 用 `compileAsync` 先編好才開始畫(`gl.warm()`)。
  - WebGL context 遺失(iOS 背景回收)後,`webglcontextrestored` 重新載入封面與書脊字、重設清除色。
- **單本加書走 issue**(`.github/ISSUE_TEMPLATE/book.yml` → `book.yml` → `tools/books/add_book.py`,規格 `docs/books-issue.md`):
  從 Goodreads 書頁的 JSON-LD 抓書目,寫進 `_data/books_added.json` + `books.json`(+ `books_zh.yml`);
  CSV 匯入時合併,同一本以 CSV 為準。撤下 = 關成 not planned。
- **修正 Goodreads 匯出不對的讀完日期與次數**:`_data/books_fix.json`(Goodreads ID → `read` / `read_count`),`books.py` 轉檔時套用。
  手動加書時 Goodreads 常多記一筆沒日期的閱讀,Read Count 會多 1。
- **中文書名**在 `_data/books_zh.yml`(Goodreads ID → 台灣譯本書名 / 作者譯名,附查證來源),CSV 重新匯入不會動它。
  網站切到中文時顯示譯名,沒列在裡面的書顯示原文。

## 測試
`uvx --with pillow --with pyyaml pytest tools -q`(本機沒有 pytest;CI 用 pip 裝)。
解析 issue body、驗證、抽 og、產 md、遷移、strike 規則、CSV 篩選與私人資料不外洩,這些我們的政策都要測;
GitHub API 與網路本身不測。前端沒有測試框架,靠建置 + htmlproofer + 手動檢查。
場景的純函式用 Node 內建測試:`node --import ./tools/scene3d/hooks.mjs --test tools/scene3d/*.test.mjs tools/shares3d/*.test.mjs tools/books3d/*.test.mjs`(CI 也跑,列出每個檔案)。

## 之後再說
書的分類維度、同步 Goodreads 心得、IG 舊書搬到 Goodreads、⌘K 快捷面板、專題、相關轉發、閱讀足跡、常讀來源、
每個 tag 一個 RSS、中文 AI 摘要、giscus 留言、縮圖備份、iPhone 捷徑、抽出 template。

## 注意
- `randyxu0711/randyxu0711` repo 是 GitHub 個人檔案 README,與本站無關,別動。
- **根目錄的 `sw.min.js` 不要刪。** 舊版(Chirpy)在訪客瀏覽器註冊過同名的 cache-first service worker,
  這個自毀版讓瀏覽器更新時清掉快取並註銷自己;刪掉的話還沒回訪的舊訪客會一直看到快取的舊網站。新網站本身不用 service worker。
