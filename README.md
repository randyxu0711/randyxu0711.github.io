# randyxu0711.github.io

個人頁 + 技術文章轉發站。主題是 [Chirpy](https://github.com/cotes2020/jekyll-theme-chirpy),建置與部署都在 GitHub Actions。

## 怎麼分享一篇文章

開一個 issue,選 **📌 分享** 表單:貼網址(必填),心得、分類、標題覆蓋都是選填。
送出後 Action 會抓原文的標題/描述/縮圖、寫成 `_posts/`、部署,並在 issue 回覆抓到了什麼。

- 抓錯了 → 編輯 issue、填「標題」欄位,會自動重跑。
- 想撤下 → 把 issue 關成 **Close as not planned**。
- 只有 repo owner 開的 issue 會被處理。

### 電腦端快捷(bookmarklet)

新增一個書籤,網址填下面這行。看文章時點它,會開好一張已經填好網址的分享表單:

```
javascript:window.open('https://github.com/randyxu0711/randyxu0711.github.io/issues/new?template=share.yml&url='+encodeURIComponent(location.href))
```

## 開發

`python3 -m pytest tools/share` 跑發文腳本的測試。設計與約束見 `CLAUDE.md`。
