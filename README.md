# randyxu0711.github.io

個人頁 + 技術文章轉發站,部署於 <https://randyxu0711.github.io>。
站上不放原創文章,只轉發他人文章(連結、縮圖、選填心得),credit 屬於原作者。

## 架構

| 元件 | 說明 |
| --- | --- |
| 版面 | 自己寫的 Jekyll 版面,不用主題(設計與決策見 [`docs/redesign/SPEC.md`](docs/redesign/SPEC.md)) |
| 建置/部署 | GitHub Actions(`.github/workflows/pages-deploy.yml`);本機用 Docker 建置,不需要 Ruby |
| 發文 | GitHub Issue Form → `share.yml` workflow → `tools/share/share.py`(純 stdlib) |
| 資料 | 每則分享一個 `_posts/<date>-share-<issue#>.md`,縮圖 hotlink 不存 repo |

```
Issue(分享文章表單)
  └─ share.yml
       ├─ share job:  share.py 解析表單 → 抓 og → 寫 _posts → commit → 在 issue 留言
       └─ deploy job: workflow_call pages-deploy.yml(GITHUB_TOKEN 的 push 不會觸發其他 workflow)
```

## 發文

開 issue,選 **分享文章** 表單。

| 欄位 | 必填 | 用途 |
| --- | --- | --- |
| 網址 | 是 | 原文連結,需為 `http(s)://` |
| 心得 | | 有填時取代 og 描述,以引言樣式顯示 |
| 分類 | | 多選,對應站上 tags;清單只定義在 `.github/ISSUE_TEMPLATE/share.yml` |
| 標題 | | 覆蓋自動抓到的 og:title |

### Issue 事件與行為

| 事件 | 結果 |
| --- | --- |
| opened / edited | 抓 og、寫入(或覆蓋)post、部署、留言回報抓到的內容、issue 標題改成文章標題並關閉 |
| 網址格式錯誤 | 不發布,留言並加上 `needs-fix` label;修正後編輯 issue 即重跑 |
| og 抓取失敗 | 照常發布,以網址當標題,留言提醒可用「標題」欄位覆蓋 |
| closed as **not planned** | 撤下該則 post 並重新部署 |
| closed as completed | 不動作(Action 發布後自己關的) |

只處理 repo owner 開的、帶 `share` label 的 issue。同時多則 issue 會排隊依序處理。

從送出到上線約 1 分鐘;瀏覽器若還是舊版,強制重新整理(`Ctrl+Shift+R`)。

發布時會順便請 Wayback Machine 存一份。`linkcheck.yml` 每週檢查原文,連續兩週連不到(404 / 410 / 網域不存在)的卡片會改連封存版。

### Bookmarklet(桌面瀏覽器)

在看的文章頁點書籤,開一張已填好網址的分享表單。

1. 顯示書籤列(Brave:`Ctrl+Shift+B`)。
2. 書籤列按右鍵 → **新增書籤**(不是「新增資料夾」)。
3. 名稱隨意;**網址**欄貼上下面整行(必須以 `javascript:` 開頭)。

```
javascript:(()=>{const u='https://github.com/randyxu0711/randyxu0711.github.io/issues/new?template=share.yml&url='+encodeURIComponent(location.href);window.open(u,'_blank')||(location.href=u)})()
```

注意:
- 要在一般 `http(s)` 網頁上點;在新分頁、`brave://` 內部頁或 PDF 檢視器上不會動作。
- 不要把這行貼到網址列執行:Chromium 系瀏覽器貼上時會自動拿掉 `javascript:` 前綴。
- 若彈出視窗被擋,會改在目前分頁開啟表單。

## 新增 Project

Projects 列在 About 頁,資料在 `_data/projects.yml`:複製一段,改 `name`、`repo`、中英文的 `summary` 與 `highlights`、`stack` 即可。
縮圖用 GitHub 自動產生的 `https://opengraph.githubassets.com/1/<owner>/<repo>`。

## 書單

1. Goodreads → My Books → Import and Export → Export Library,下載 CSV。
2. 放到 `books/goodreads_library_export.csv`(`books/` 已 gitignore,CSV 含私人筆記,不要 commit)。
3. 執行 `bash tools/books/run.sh`(需要 Docker),會更新 `_data/books.json` 與 `_data/book_covers.json`。
4. commit 這兩個檔並 push,網站會自動部署。

不想公開的書,在 Goodreads 放進 `hide` 書架。封面只抓新加的書,已經抓過的會跳過。

## 開關功能與外觀

- `_config.yml` 的 `modules:` 一行一個功能(篩選、已開過、封存版、書單),註解掉就關掉。
- `_config.yml` 的 `appearance:` 改主色色相(`hue`,琥珀 = 72)、彩度、預設主題與卡片框厚。

## 開發

```bash
uvx --with pillow pytest tools -q   # 所有 Python 工具的測試(發文、遷移、連結檢查、書單)

# 本機建置 + 檢查連結
docker run --rm -v "$PWD":/srv -v jekyll-bundle:/usr/local/bundle -w /srv ruby:3.4 bash -c \
  "bundle install --quiet && bundle exec jekyll build && bundle exec htmlproofer _site --disable-external"

# 本機預覽(http://localhost:4000)
docker run --rm -p 4000:4000 -v "$PWD":/srv -v jekyll-bundle:/usr/local/bundle -w /srv ruby:3.4 bash -c \
  "bundle install --quiet && bundle exec jekyll serve -H 0.0.0.0 -l"
```

push 到 `tools/**` 時 CI 也會跑同一組測試(`.github/workflows/test.yml`)。設計決策與約束見 [`CLAUDE.md`](CLAUDE.md)。
