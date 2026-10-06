# Spec:琥珀改版(v1)

設計稿:[琥珀卡片設計稿](https://claude.ai/artifact/HJLMVYFqbd29XSYbtbkpPx)、[書架原型](https://claude.ai/artifact/JLcpvpjL6JeYaX9ZG8DgrJ)。
兩份都是示意,與本文件衝突時以本文件為準。

## 目標

把站從「Chirpy 部落格 + 7 個覆蓋檔」換成自己寫的 Jekyll 版面,做三件事:

1. **外觀**:黑琥珀配色、透明膠框立體卡片,晝夜兩套。
2. **首頁變書架**:原地篩選、記得看過哪些、鍵盤可操作;轉發的原文失效時有封存版可看。
3. **新增書單**:從 Goodreads 匯出的 CSV 產生,書脊牆與封面牆兩種排法。

先做 Randy 自己的版本,**之後才抽 template**。v1 不做 template,但要守住「之後好抽」的三條規則(見〈邊界〉)。

訪客:主要是工程師,以及想認識 Randy 的人。訪客要做的事:在轉發的文章裡找到想看的、看 Randy 的 projects 與書單。

## 已定案的決策

| 項目 | 決定 |
|---|---|
| 框架 | Jekyll,**不用 Chirpy**,版面全部自己寫 |
| 發文 | 維持 issue → `share.yml` → `share.py` 流程,行為不變 |
| 配色 | 用 oklch 從一個色相算出晝夜兩套語意 token;琥珀 = hue 72 |
| 卡片 | 膠框:樹脂框 + 上亮下暗的邊緣 + 內容區內凹 + 縮圖透進框;框厚分三級 12 / 9 / 5px |
| 字型 | Noto Sans TC,退回系統字型(蘋方、微軟正黑) |
| 首頁 | 版面 B:最新一則用精選卡,其餘格狀;上方原地篩選 |
| 書單資料 | Goodreads 匯出 CSV,**在本機**用 `tools/books/run.sh` 轉成 `_data/books.json` 再 commit;CSV 含私人筆記與完整書單,**永遠不進 repo**;不抓 RSS(`robots.txt` 禁止 `/review/list_rss`) |
| 書單封面 | 本機轉換時從 Goodreads 書頁(`/book/show/<id>`)的 og:image 取得,只抓新書;圖片 hotlink,repo 只存網址與主色 |
| 書單顯示 | 只顯示 read 書架;依評分分列,最後一列「未評分」;`hide` 書架跳過;Private Notes 永不發布 |
| 書單排法 | 書脊牆、封面牆都支援;預設寫在設定(Randy 設成書脊牆);訪客切換後記住 |
| 翻開的書 | dialog 卡片,左右滑 / 方向鍵 / 按鈕翻同一列的前後本;角落有「在 Goodreads 查看」小連結 |
| v1 模組 | 書架篩選、已開過、封存備份、書單 |

## 技術棧

- Jekyll 4.4(Ruby 3.4,GitHub Actions 建置,沿用 `pages-deploy.yml`)
- Gem:`jekyll`、`jekyll-seo-tag`、`jekyll-sitemap`、`html-proofer`(test group)。拿掉 `jekyll-theme-chirpy`
- CSS:手寫,不用 Sass、不用框架。token 檔用 Liquid 從 `_config.yml` 注入數值
- JS:原生 ES2017,不打包、不用框架。每個模組一支,沒有 JS 時頁面照樣能用
- Python 3.12:`tools/share`(純 stdlib,維持)、`tools/linkcheck`(純 stdlib)、`tools/books`(stdlib + **Pillow**,只用來算封面主色)
- 字型:Google Fonts 的 Noto Sans TC 400 / 500 / 700

## 指令

```bash
# 測試(所有 Python 工具)
python3 -m pytest tools -q

# 本機建置(本機沒有 Ruby,用 Docker;gem 快取在 jekyll-bundle volume)
docker run --rm -v "$PWD":/srv -v jekyll-bundle:/usr/local/bundle -w /srv ruby:3.4 \
  bash -c "bundle install --quiet && bundle exec jekyll build"

# 本機預覽(Brave 開 http://localhost:4000)
docker run --rm -p 4000:4000 -v "$PWD":/srv -v jekyll-bundle:/usr/local/bundle -w /srv ruby:3.4 \
  bash -c "bundle install --quiet && bundle exec jekyll serve -H 0.0.0.0 -l"

# 建置後檢查(CI 也跑)
bundle exec htmlproofer _site --disable-external \
  --ignore-urls "/^http:\/\/127.0.0.1/,/^http:\/\/0.0.0.0/,/^http:\/\/localhost/"

# 書單轉換(本機,用 Docker 裝 Pillow;CSV 放在 books/,已 gitignore)
bash tools/books/run.sh

# 連結檢查(每週排程跑這行)
python3 tools/linkcheck/linkcheck.py _posts _data/linkcheck.json
```

## 設定

`_config.yml` 新增以下設定(不用 `theme:` 這個鍵,它是 Jekyll 保留給 gem 主題的):

```yaml
appearance:
  hue: 72          # 主色色相
  chroma: 0.15     # 彩度
  mode: system     # system / light / dark,訪客可再切換
  rim: 9px         # 一般卡片框厚;精選 = rim × 4/3,精簡 = rim × 5/9

modules:           # 註解掉一行 = 關掉一個功能
  shelf-filter: { slots: [before-shelf] }
  seen:         { slots: [card-meta] }
  archive:      { slots: [card-meta] }
  books:        { slots: [] }          # 書單是整頁,不掛插槽;關掉時導覽列不顯示「書架」

books:
  default_view: spines   # spines / covers
  hide_shelf: hide
```

## 專案結構

```
_config.yml                 站台設定 + appearance / modules / books
_data/
  projects.yml              About 頁的 projects(從 about.md 的手寫 HTML 搬出來)
  books.json                tools/books 產生,不手改
  book_covers.json          封面快取 {book_id: {cover, color}},tools/books 讀寫
  linkcheck.json            tools/linkcheck 產生 {issue: {strikes, dead}},只記錄 strikes > 0 的
_layouts/
  default.html              <head>、導覽列、footer、插槽 header-tools / footer
  home.html                 書架首頁,插槽 before-shelf / after-shelf
  books.html                書單頁
  page.html                 一般頁(About)
_includes/
  head.html  nav.html  footer.html
  slot.html                 依 site.modules 把模組片段插進指定插槽
  share-card.html           參數 post、variant(feature / card / compact)
  project-card.html
  book-spine.html  book-cover.html  book-dialog.html
  modules/<name>/<slot>.html  模組掛進插槽的片段
assets/
  css/tokens.css            第 1、2 層 token(有 front matter,Liquid 注入 appearance)
  css/gel.css               膠框材質
  css/site.css              版面與元件
  modules/<name>/<name>.js|.css
  img/favicons/             保留
_posts/                     share,維持現在的檔名與 front matter
_tabs/about.md              保留中英切換;projects 改從 _data/projects.yml 迴圈產生
books/                      放 Goodreads CSV 的地方,已 gitignore,永遠不 commit
tools/
  share/                    維持;加 archive 欄位;migrate_archive.py(一次性遷移)
  books/   books.py  run.sh  test_books.py  fixtures/
  linkcheck/  linkcheck.py  test_linkcheck.py
.github/workflows/
  pages-deploy.yml          維持
  share.yml                 維持
  linkcheck.yml             新:每週一次 → linkcheck.py → 有變才 commit 並部署
  test.yml                  pytest 範圍改成 tools,並安裝 Pillow
docs/redesign/SPEC.md       本文件
```

要移除:Chirpy gem、`assets/lib` submodule、`_plugins/posts-lastmod-hook.rb`、`_data/contact.yml`、`_data/share.yml`、
`_tabs/archives.md`、`_tabs/tags.md`、`_includes/{update-list,search-loader,metadata-hook,share-link}.html`、
`_layouts/{archives,tag}.html`、`assets/js/data/search.json`、`assets/css/jekyll-theme-chirpy.scss`。

## 資料契約

### share(`_posts/*.md` front matter)

現有欄位不變:`title` `link` `source` `description` `image` `note` `tags` `issue` `date`。新增:

| 欄位 | 寫入者 | 說明 |
|---|---|---|
| `archive` | share.py | 發布時向 Wayback Machine 送存檔請求(不擋發布);一律寫入 `https://web.archive.org/web/<link>`,指向最新快照 |

失效狀態不寫進 front matter,放在 `_data/linkcheck.json`,避免每週改動一堆 post。

### 書(`_data/books.json`)

```json
[{
  "id": "23361794",
  "title": "百年孤寂",
  "author": "加布列.賈西亞.馬奎斯",
  "rating": 5,
  "pages": 416,
  "read": "2024-03-02",
  "added": "2024-03-05",
  "shelves": ["latin-american"],
  "url": "https://www.goodreads.com/book/show/23361794",
  "cover": "https://m.media-amazon.com/images/.../23361794.jpg",
  "color": "#7a3b1f"
}]
```

- 來源欄位:`Book Id` `Title` `Author` `My Rating` `Number of Pages` `Date Read` `Date Added` `Bookshelves` `Exclusive Shelf`。
- `rating` 0 代表未評分。`pages`、`read`、`cover`、`color` 可能是 `null`。
- **輸出裡永遠沒有 `Private Notes` 和 `My Review`**(心得同步是之後的事)。
- 只輸出 `Exclusive Shelf == read`,且 `Bookshelves` 不含 `books.hide_shelf` 的書。
- 排序:評分高到低;同評分依 `read` 新到舊,`read` 為 null 的依 `added` 排在後面。

## 元件與行為

**膠框**(`.gel`):樣式依設計稿〈膠框的構造〉的四層。縮圖透光用 `--img` 自訂屬性(行內 `style`)。
`prefers-reduced-transparency` 時樹脂改不透明、不透光;`prefers-reduced-motion` 時不浮起;
`forced-colors` 時補實線外框;不支援 oklch 時退回固定琥珀色碼。

**share 卡**:整張卡片可點,直接開原文、另開分頁(`target="_blank" rel="noopener"`)。
有 `note` 顯示 note,否則顯示 `description`(3 行截斷)。縮圖 `loading="lazy"`,載入失敗就移除縮圖區。
來源網域在左、日期在右;tags 用膠囊標籤。卡片連結被 linkcheck 判定失效時,改連 `archive` 並標示「原文已下架,這是封存版」。

**首頁**:最新一則 = 精選卡(橫式,手機變直式);其餘 `auto-fill, minmax(19rem, 1fr)` 格狀。
首頁的 share 列表不分頁(沒有第 1、2 頁),全部列在首頁上,縮圖捲到才載入。站上的頁面仍是分開的:首頁(分享)、書架、關於。

**shelf-filter 模組**:
- tag 膠囊複選,條件是 AND;每個 tag 後面顯示數量。
- 文字篩選框,比對標題、來源、心得、摘要。
- 篩選狀態寫進網址 hash(例如 `#tags=AI%2FLLM,Security&q=agent`),重新整理或分享連結時還原。
- 顯示「N 則」;沒有結果時顯示「沒有同時符合這些條件的文章。少選一個 tag 試試。」
- 鍵盤:`/` 聚焦篩選框,`j` / `k` 下一則、上一則,`Enter` 開原文;焦點在輸入框時不攔截。

**seen 模組**:點過的卡片存在 `localStorage`(以 `link` 為鍵,讀寫都包 try/catch);
已開過的卡片框色變淡、標題變次要色,來源後面加「,已開過」。footer 有「清除已開過」。

**archive 模組**:share.py 寫入 `archive`;linkcheck 每週 GET 每則 `link`(20 秒逾時)。
404、410、DNS 失敗算一次 strike,**連續兩週**都失敗才標成 `dead`;恢復正常就清掉。
403、429、5xx 不算(多半是擋機器人或暫時故障)。

**書單頁**(`/books/`,books 模組):
- 依評分分列:★5 → ★1,最後是「未評分」;空的列不顯示;每列標題顯示本數。
- **書脊牆**:每列一個膠框展示櫃,書脊寬 = `clamp(24px, 18px + pages/26, 58px)`(pages 為 null 用 28px),
  顏色 = `color`(null 時用主色色相算的預設色),文字色依明度自動選深或淺;書名直排(`writing-mode: vertical-rl`),過長截斷。
- **封面牆**:2:3 封面卡片,`auto-fill, minmax(8.5rem, 1fr)`。
- 排法切換鈕在頁首;預設 = `books.default_view`;訪客的選擇存在 `localStorage`。
- 點書 → `<dialog>`:封面(載入失敗時用書名排的備用封面)、書名、作者、星等、頁數、「在 Goodreads 查看」。
  左右滑(位移 > 50px)、方向鍵、‹ › 按鈕翻同一列的前後本;Esc / 點背景 / × 關閉,焦點回到原本那本書。
- `books.json` 不存在或是空的:導覽列不顯示「書架」,`/books/` 不產生。

**About**:保留中 / EN 切換;projects 用 `project-card.html` 從 `_data/projects.yml` 產生,技術清單改成膠囊標籤。

**導覽列**:站名、分享(首頁)、書架、關於、主題切換(跟系統 / 晝 / 夜,存在 `localStorage`)。拿掉 Chirpy 的側欄、tag 頁、封存頁。

**Feed**:自己寫 `feed.xml`(Atom),每則 entry 連到原文 `link`。

**內部 post 頁**:不再產生 share 的內部頁面(`_site` 裡沒有個別 share 的 HTML)。

## 程式風格

CSS 只引用語意 token,元件裡不寫色碼:

```css
/* 好 */
.tag { background: var(--chip); color: var(--ink); }
/* 不行:色碼寫死在元件裡,換色相或換主題就壞 */
.tag { background: #f2a93b33; color: #1d1a16; }
```

插槽的寫法(模組只能透過插槽掛進版面):

```liquid
{%- comment -%} _includes/slot.html:把啟用中、有宣告這個插槽的模組片段插進來 {%- endcomment -%}
{%- for m in site.modules -%}
  {%- if m[1].slots contains include.name -%}
    {%- capture path -%}modules/{{ m[0] }}/{{ include.name }}.html{%- endcapture -%}
    {%- include {{ path }} post=include.post -%}
  {%- endif -%}
{%- endfor -%}
```

- 註解、commit 訊息用繁體中文,跟現在的 repo 一致。
- Python 照 `tools/share/share.py` 的風格:純函式做解析與政策,I/O 集中在 `main()`,網路呼叫可以注入,方便測試。
- 介面文字用一般說法、主動語態,不加 emoji,不在連結文字後面接「→」。

## 測試策略

`python3 -m pytest tools -q`,測**我們自己的政策**,網路與 GitHub API 本身不測(沿用 CLAUDE.md 的原則)。

| 工具 | 要測的 |
|---|---|
| share | 現有測試全部不改照樣通過;`archive` 欄位寫入;Wayback 請求失敗時照常發布 |
| books | CSV 解析(含中文、逗號、引號);只留 read;hide 書架排除;**輸出 JSON 裡不含 Private Notes 的任何文字**;rating 0 → 未評分;pages、日期為空 → null;排序規則;封面快取命中時不呼叫抓取函式;從 Goodreads 書頁 fixture 抽 og:image;主色計算(用 Pillow 在記憶體產生的純色圖) |
| linkcheck | strike 規則(404 一次不算 dead、兩次才算;403 / 429 / 5xx 不算;恢復後清掉);輸出格式 |

前端沒有 JS 測試框架,用以下方式驗證:建置成功、htmlproofer 通過,再加〈成功條件〉裡的手動檢查清單。

## 邊界

**一定要做**
- 版面與元件不寫個人資料(名字、email、自介、projects 都放在 `_config.yml`、`_data/` 或 `_tabs/`)
- 樣式只引用語意 token;模組只透過插槽掛進版面,關掉模組不會讓其他東西壞掉
- 沒有 JS 時,卡片與連結照樣能用
- 新增欄位一律選填,舊 share 沒有該欄位時照常顯示
- 有 Python 工具就要有測試;commit 前跑 `python3 -m pytest tools -q`
- 在 `redesign` 分支開發,全部完成並經 Randy 確認後才合併

**先問過才做**
- 新增上面〈技術棧〉以外的相依套件
- 改變 share issue 流程對外的行為(留言內容、label、關 issue 的方式)
- 合併到 `main` 或推到 `main`
- 新增上面〈專案結構〉以外的 workflow

**絕對不做**
- 發布 Goodreads 的 Private Notes
- 自動抓取 Goodreads 的 `/review/list_rss` 或其他 `robots.txt` 禁止的路徑
- 把 og 圖或書封面存進 repo(v1)
- 動 `randyxu0711/randyxu0711` repo

## 成功條件

1. `python3 -m pytest tools -q` 全部通過,`tools/share` 的既有測試沒有被改動。
2. CI 建置成功,htmlproofer 通過;`Gemfile.lock` 裡沒有 `jekyll-theme-chirpy`。
3. `_site` 裡沒有個別 share 的內部頁;sitemap 只列真正的頁面。
4. 開一個 share issue,流程與留言跟現在一樣,新 post 有 `archive` 欄位,首頁出現成精選卡。
5. 執行 `bash tools/books/run.sh` 後產生 `books.json`,commit、push 後 `/books/` 出現書單;
   再跑一次,封面抓取次數是 0;`git status` 裡沒有任何 CSV。
6. 手動檢查(桌機 Brave + 手機寬度,晝夜各一次):
   - 首頁:精選卡 + 格狀;篩選、文字篩選、hash 還原、`j` / `k` / `Enter` / `/` 都可用;已開過會記住
   - 書單:兩種排法可切換且會記住;dialog 可滑、可用方向鍵、Esc 關閉後焦點回原處
   - 主題切換三種狀態都正確;主色改成 hue 200 後全站一起變色,沒有殘留的琥珀色碼
   - 系統開「減少動態」、「減少透明度」時的退路有生效
   - 鍵盤 Tab 走一遍,每個可操作的東西都有可見的焦點框
7. 把 `_config.yml` 裡任一個模組註解掉,建置照樣成功、頁面沒有壞掉。
8. 既有的 share 都有 `archive` 欄位;再跑一次 `migrate_archive.py`,`git diff` 是空的。

## 之後再說(不在 v1)

書的分類維度、同步 Goodreads 心得、IG 舊書搬到 Goodreads、⌘K 快捷面板、專題、相關轉發、閱讀足跡、常讀來源、
每個 tag 一個 RSS、中文 AI 摘要、giscus 留言、縮圖備份、iPhone 捷徑、抽出 template。

## 遷移

既有的 share 要補上 `archive` 欄位。做法是寫一支一次性的 `tools/share/migrate_archive.py`:

- 對每則沒有 `archive` 的 post,送出 Wayback 存檔請求,並寫入 `archive` 欄位。
- 只加這個欄位,不動其他欄位;跑第二次時不會改動任何檔案。
- 有測試(用暫存資料夾裡的 post fixture)。
- 在 `redesign` 分支跑一次,跟改版一起合併。

## 已解決

- **本機建置**:Docker Desktop 的 WSL 整合已開啟,2026-10-06 用目前的 repo 實測 `jekyll build` 成功。
  合併前另外再看 CI 的建置結果。
- **CSV 不進 repo**:repo 是公開的,CSV 含 Private Notes、心得、想讀清單與 hide 書架的書,commit 就會永久留在 git 歷史。
  所以改成本機轉換,只 commit 產生的 `books.json`。封面也從本機抓,「Actions 的 IP 會不會被 Goodreads 擋」的問題就不存在了。

## 待決問題

目前沒有。
