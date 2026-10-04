# CLAUDE.md — randyxu0711.github.io

個人首頁 + 技術文章轉發站,跑在 GitHub Pages(`https://randyxu0711.github.io`)。
**不寫文章**;內容是「別人的技術文章(連結+縮圖+選填心得)」,credit 屬於原作者。

## 架構
- **Chirpy 主題**(Gemfile 鎖死版本)+ GitHub Actions 部署(`pages-deploy.yml`)。本機無 Ruby,建置在雲端。
- 個人資料 = Chirpy 側欄;**projects 放 About 頁**(`_tabs/about.md`,手寫卡片)。
- 只用 tags,不用 categories(categories tab 已刪)。

## 一則 share = 一個 `_posts/<date>-share-<issue#>.md`
front matter:`title`(og:title)/ `link`(原文)/ `source`(網域)/ `description`(og:description)/
`image`(og:image,hotlink 不存 repo)/ `note`(心得,選填)/ `tags` / `issue`。
- **所有列出 share 的地方都直接開原文、另開分頁**:覆蓋了 `_layouts/{home,tag,archives}.html`、
  `_includes/{update-list,search-loader}.html`、`assets/js/data/search.json`。
  共用的連結邏輯在 `_includes/share-link.html`。**升級 Chirpy 時要逐一對照這些覆蓋檔。**
- 內部 post 頁仍會生成但沒人連:`noindex`(`_includes/metadata-hook.html`)+ `sitemap: false`。
- 摘要:有 note 顯示 note(引言樣式),否則 description。縮圖載入失敗就移除。

## 發文 = 開 GitHub Issue
- Issue Form `.github/ISSUE_TEMPLATE/share.yml`:網址(必填)/ 心得 / tags(多選)/ 標題覆蓋,後三者選填。
  **tag 清單只有這一份**,加 tag = 加一行。
- Workflow `.github/workflows/share.yml` → `tools/share/share.py`(純 stdlib):
  作者≠owner 略過 → 網址格式不對:不發布、留言 + `needs-fix` → 抓 og(失敗不擋,退回用網址當標題並在留言提醒)
  → 寫 md、commit → 呼叫部署 → 留言列出抓到的內容並關 issue。
  - 編輯 issue 會重跑覆蓋;關成 **not planned** → 撤下。關成 completed(Action 自己關的)不動作。
  - **GITHUB_TOKEN 的 push 不會觸發其他 workflow**,所以 share.yml 用 `workflow_call` 直接呼叫部署。
- 電腦端 bookmarklet 見 README。iPhone 捷徑暫不做。

## 測試
`python3 -m pytest tools/share` — 解析 issue body、驗證、抽 og、產 md 這些我們的政策都要測;
GitHub API 與網路本身不測。

## 之後再說
giscus 留言、categories、iPhone 捷徑、做成通用 template。

## 注意
- `randyxu0711/randyxu0711` repo 是 GitHub 個人檔案 README,與本站無關,別動。
