# randyxu0711.github.io

個人頁 + 技術文章轉發站,部署於 <https://randyxu0711.github.io>。
站上不放原創文章,只轉發他人文章(連結、縮圖、選填心得),credit 屬於原作者。

## 架構

| 元件 | 說明 |
| --- | --- |
| 主題 | [Chirpy](https://github.com/cotes2020/jekyll-theme-chirpy),版本鎖在 `Gemfile` |
| 建置/部署 | GitHub Actions(`.github/workflows/pages-deploy.yml`),本機不需要 Ruby |
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

從送出到上線約 1 分鐘;瀏覽器若還是舊版,是 PWA 快取,點「有新內容」提示或強制重新整理。

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

Projects 列在 About 頁,手寫卡片於 `_tabs/about.md`,複製一個 `<a class="proj-card">` 區塊改 repo 名與簡介即可。
縮圖用 GitHub 自動產生的 `https://opengraph.githubassets.com/1/<owner>/<repo>`。

## 開發

```bash
python3 -m pytest tools/share   # 發文腳本測試(表單解析、驗證、og 抽取、產生 md)
```

push 到 `tools/**` 時 CI 也會跑同一組測試(`.github/workflows/test.yml`)。

覆蓋 Chirpy 的檔案(升級主題時需逐一比對):
`_layouts/{home,tag,archives}.html`、`_includes/{update-list,search-loader,share-link,metadata-hook}.html`、
`assets/js/data/search.json`。設計決策與約束見 [`CLAUDE.md`](CLAUDE.md)。
