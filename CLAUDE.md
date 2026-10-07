# CLAUDE.md — randyxu0711.github.io

個人首頁 + 技術文章轉發站 + 書單,跑在 GitHub Pages(`https://randyxu0711.github.io`)。
**不寫文章**;內容是「別人的技術文章(連結+縮圖+選填心得)」,credit 屬於原作者。
設計與決策的完整紀錄:`docs/redesign/SPEC.md`(規格)、`docs/redesign/PLAN.md`(實作計畫)、`docs/redesign/SLAB.md`(v2 板材視覺)。

## 架構
- **Jekyll 4.4,不用主題**,版面全部自己寫。GitHub Actions 部署(`pages-deploy.yml`)。
  本機無 Ruby,用 Docker 建置(指令見 `docs/redesign/SPEC.md`〈指令〉)。
- **三層 token**:`_config.yml` 的 `appearance`(色相、模式、厚度)→ `assets/css/tokens.css`(Liquid 注入,晝夜兩套語意 token)
  → 元件。**元件 CSS 只引用語意 token,不寫色碼**(書脊 / 封面的顏色來自資料,例外)。
- **桌面與板材**(`assets/css/slab.css`):頁面是桌面(`--desk`),卡片、書、project、按鍵都是 `.slab` 板;
  立體感 = 上緣反光 + 底下側面(`--th` 厚度)+ 兩層陰影。另有 `.key`(按鍵,按下沉進桌面)、`.groove`(輸入框凹槽)、
  `.coin`(圓形頭像)。**琥珀只用在三個時刻**:精選卡、游標停留 / 鍵盤聚焦(側面亮成琥珀)、按下的狀態;
  平常的側面是暖中性色,書的側面是紙色。`data-tilt` 的板會朝游標傾斜(`assets/js/slab.js`,也管捲動玻璃導覽列與主題鍵)。
- **模組與插槽**:`_config.yml` 的 `modules:` 一行一個模組,註解掉就關掉。版面用 `{% include slot.html name="…" %}`
  預留插槽(`header-tools` / `before-shelf` / `after-shelf` / `card-meta` / `footer`),
  模組片段在 `_includes/modules/<m>/<slot>.html`,樣式與 JS 在 `assets/modules/<m>/<m>.{css,js}`(每頁都載入)。
  目前的模組:`shelf-filter`(原地篩選)、`seen`(已開過)、`archive`(失效改連封存版)、`books`(書單頁)。
- **版面不寫個人資料**:名字、自介、導覽在 `_config.yml`,projects 在 `_data/projects.yml`,自介全文在 `_tabs/about.md`。
- 沒有 JS 時卡片與連結照樣能用;模組的控制項先 `hidden`,JS 啟動後才顯示(全站有 `[hidden] { display: none !important }`)。
- 只用 tags,不用 categories。
- **中英切換**(全站):介面文字只寫在 `_data/i18n.yml`(`zh` / `en`,英文單數用 `en_one`)。版面標 `data-i18n="鍵"`
  (屬性用 `data-i18n-attr="屬性:鍵"`,數字用 `data-i18n-n`),預設中文由 `{% include t.html k="鍵" %}` 輸出;
  `assets/js/i18n.js` 依 `<html data-lang>` 換字,模組用 `window.siteI18n.t()` 並監聽 `langchange`。
  整段內容(About、404)寫 `.lang-zh` / `.lang-en` 兩份,CSS 只顯示一份。share 的標題與心得不翻譯。
  `t.html` 的 `{n}` 要先在 tag 裡 assign:Liquid 的 `{{ }}` 遇到單一個右大括號就會當成結尾。

## 一則 share = 一個 `_posts/<date>-share-<issue#>.md`
front matter:`title`(og:title)/ `link`(原文)/ `archive`(Wayback 最新快照網址)/ `source`(網域)/
`description`(og:description)/ `image`(og:image,hotlink 不存 repo)/ `note`(心得,選填)/ `tags` / `issue`。
- **所有列出 share 的地方都直接開原文、另開分頁**,卡片在 `_includes/share-card.html`。
- **share 不產生內部頁**:`_plugins/no-post-output.rb`(`collections.posts.output: false` 在 Jekyll 無效)。
- 摘要:有 note 顯示 note,否則 description。縮圖載入失敗就移除。

## 發文 = 開 GitHub Issue
- Issue Form `.github/ISSUE_TEMPLATE/share.yml`:網址(必填)/ 心得 / tags(多選)/ 標題覆蓋,後三者選填。
  **tag 清單只有這一份**,加 tag = 加一行。
- Workflow `.github/workflows/share.yml` → `tools/share/share.py`(純 stdlib):
  作者≠owner 略過 → 網址格式不對:不發布、留言 + `needs-fix` → 抓 og(失敗不擋,退回用網址當標題並在留言提醒)
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
- 不抓 Goodreads 的 RSS(`robots.txt` 禁止 `/review/list_rss`);封面從書頁 `/book/show/<id>` 的 og:image 取得。
- 書單是空的或 books 模組關掉時,`_plugins/books-page.rb` 不產生 `/books/`,導覽列也不顯示。
- **單本加書走 issue**(`.github/ISSUE_TEMPLATE/book.yml` → `book.yml` → `tools/books/add_book.py`,規格 `docs/books-issue.md`):
  從 Goodreads 書頁的 JSON-LD 抓書目,寫進 `_data/books_added.json` + `books.json`(+ `books_zh.yml`);
  CSV 匯入時合併,同一本以 CSV 為準。撤下 = 關成 not planned。
- **中文書名**在 `_data/books_zh.yml`(Goodreads ID → 台灣譯本書名 / 作者譯名,附查證來源),CSV 重新匯入不會動它。
  網站切到中文時顯示譯名,沒列在裡面的書顯示原文。

## 測試
`uvx --with pillow pytest tools -q`(本機沒有 pytest;CI 用 pip 裝)。
解析 issue body、驗證、抽 og、產 md、遷移、strike 規則、CSV 篩選與私人資料不外洩,這些我們的政策都要測;
GitHub API 與網路本身不測。前端沒有測試框架,靠建置 + htmlproofer + 手動檢查。

## 之後再說
書的分類維度、同步 Goodreads 心得、IG 舊書搬到 Goodreads、⌘K 快捷面板、專題、相關轉發、閱讀足跡、常讀來源、
每個 tag 一個 RSS、中文 AI 摘要、giscus 留言、縮圖備份、iPhone 捷徑、抽出 template。

## 注意
- `randyxu0711/randyxu0711` repo 是 GitHub 個人檔案 README,與本站無關,別動。
