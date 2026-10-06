# 琥珀改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拿掉 Chirpy,改成自己寫的 Jekyll 版面(琥珀膠框卡片、書架式首頁、書單頁),並加上封存備份與失效連結檢查。

**Architecture:** 三層 CSS token(原始值 → 晝夜語意 → 元件)+ 一個 `.gel` 材質;版面預留具名插槽,模組透過 `_config.yml` 的 `modules:` 掛進插槽。Python 工具(share / books / linkcheck)產生資料,Jekyll 只負責渲染。

**Tech Stack:** Jekyll 4.4、Liquid、手寫 CSS(oklch)、原生 JS(ES2017)、Python 3.12(stdlib;books 另用 Pillow)、GitHub Actions。

**Spec:** `docs/redesign/SPEC.md`。設計參考:`docs/redesign/mockups/amber-cards.html`、`docs/redesign/mockups/bookshelf.html`(示意,與 SPEC 衝突時以 SPEC 為準)。

## Global Constraints

- 在 `redesign` 分支開發;各平行工作在自己的 worktree 分支,完成後合回 `redesign`。**不准推 `main`**。
- 版面與元件不寫個人資料;名字、自介、導覽、projects 放 `_config.yml` / `_data/` / `_tabs/`。
- 元件 CSS 只引用語意 token(`var(--ink)` 等),不寫色碼。唯一例外:書脊/封面的顏色來自資料(行內 `--col`)。
- 沒有 JS 時,share 卡片與連結照樣能用;模組的控制項在 JS 啟動前保持 `hidden`。
- 所有 `localStorage` 讀寫包 try/catch。
- 新增欄位一律選填;舊資料沒有該欄位要照常顯示。
- 相依套件只限:`jekyll ~> 4.4`、`jekyll-seo-tag`、`jekyll-sitemap`、`html-proofer ~> 5.0`、Pillow(只在 books)。
- 字型只用 Google Fonts 的 Noto Sans TC 400/500/700,退回 `"PingFang TC", "Microsoft JhengHei", system-ui, sans-serif`。
- 介面文字:繁體中文、一般說法、主動語態;不加 emoji;連結文字後面不接「→」。
- 註解與 commit 訊息用繁體中文;commit 結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- **Goodreads 匯出的 CSV 永遠不進 repo**(`books/` 在 `.gitignore`);輸出永遠不含 Private Notes、My Review。
- 不抓 Goodreads 的 `/review/list_rss` 或任何 `robots.txt` 禁止的路徑。
- 測試:`python3 -m pytest tools -q`;`tools/share/test_share.py` 的既有測試一行都不改。

**建置指令**(本機沒有 Ruby,一律用 Docker;以下簡稱 `JEKYLL_BUILD`):

```bash
docker run --rm -v "$PWD":/srv -v jekyll-bundle:/usr/local/bundle -w /srv ruby:3.4 bash -c \
  "git config --global --add safe.directory /srv && bundle install --quiet && JEKYLL_ENV=production bundle exec jekyll build && \
   bundle exec htmlproofer _site --disable-external --ignore-urls '/^http:\/\/127.0.0.1/,/^http:\/\/0.0.0.0/,/^http:\/\/localhost/'"
```

預覽(Brave 開 `http://localhost:4000`):

```bash
docker run --rm -p 4000:4000 -v "$PWD":/srv -v jekyll-bundle:/usr/local/bundle -w /srv ruby:3.4 bash -c \
  "git config --global --add safe.directory /srv && bundle install --quiet && bundle exec jekyll serve -H 0.0.0.0 -l"
```

## Review Focus

1. **og:image 網址含 `'`、`(`、`)`、空白**:行內 `style="--img: url('…')"` 不能被打斷,卡片照常顯示。→ Task 3 的建置檢查用一則刻意刁難的暫時 post 驗證。
2. **最精簡的 share**(沒有 image、description、note、tags)與 **note 含 HTML / 多行**:卡片不留空白區、note 被跳脫、換行保留。→ Task 3 同一個暫時 post。
3. **tag 名稱含 `/` 與空白**(`AI/LLM`、`Programming Languages`):篩選與網址 hash 來回轉換不失真。→ Task 4 的手動檢查清單逐一列出。
4. **Goodreads CSV 的真實格式**:UTF-8 BOM、CRLF、心得欄含逗號/引號/換行、ISBN 是 `="..."` 形式、日期 `2024/03/02`、空的頁數。→ Task 9 的 fixture 全部涵蓋。
5. **外文書名放在直排書脊**:拉丁字母要橫躺(`text-orientation: mixed`),過長要截斷,不能撐破書脊。→ Task 11 的手動檢查。

---

## 工作分波(給平行開發用)

```
Wave 0(主線自己做)  Task 0  開分支、commit spec / plan / mockups

Wave 1(三條線同時)
  線 F:Task 1 → Task 2 → Task 3          版面地基(依序)
  線 P:Task 6 → Task 7 → Task 8          封存與連結檢查(純 Python + workflow)
  線 B:Task 9                             書單轉換工具(純 Python)

Wave 2(Task 3 合回後,四條線同時)
  Task 4  shelf-filter 模組
  Task 5  seen 模組
  Task 10 archive 卡片標示
  Task 11 書單頁(需要 Task 9 的資料格式,Task 9 已在 Wave 1 完成)
  Task 12 About + projects 資料化

Wave 3(主線)  Task 13  文件、CI、整體驗證、開 PR
```

**避免衝突的約定**:Task 1 一次寫好最終版的 `_config.yml`(含所有模組)與每個模組的空白樁檔(stub)。之後的 task 只改自己模組的檔案,不碰 `_config.yml`、`_layouts/default.html`。唯一例外:Task 11 新增 `_plugins/books-page.rb` 與 `books.md`。

---

### Task 0: 開分支並 commit 規格

**Files:**
- Commit: `docs/redesign/SPEC.md`、`docs/redesign/PLAN.md`、`docs/redesign/mockups/*.html`

- [ ] **Step 1: 開分支**

```bash
git switch -c redesign
```

- [ ] **Step 2: commit**(`docs` 已在 `_config.yml` 的 `exclude`,不會出現在網站上)

```bash
git add docs/redesign
git commit -m "docs: 琥珀改版規格、實作計畫與設計稿

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: 拿掉 Chirpy,建立版面骨架

**Files:**
- Modify: `Gemfile`、`_config.yml`、`.gitignore`、`index.html`
- Create: `_layouts/default.html`、`_layouts/page.html`、`_layouts/home.html`(暫時版)、`_includes/head.html`、`_includes/nav.html`、`_includes/footer.html`、`_includes/slot.html`、`feed.xml`、`404.html`
- Create(模組樁檔,內容為空或一行註解):
  `_includes/modules/shelf-filter/before-shelf.html`、`_includes/modules/seen/card-meta.html`、`_includes/modules/seen/footer.html`、`_includes/modules/archive/card-meta.html`、
  `assets/modules/{shelf-filter,seen,archive,books}/{name}.css` 與 `.js`(8 個檔)
- Create(暫時空檔,Task 2 填內容):`assets/css/tokens.css`、`assets/css/gel.css`、`assets/css/site.css`、`assets/js/theme.js`
- Delete: `assets/lib`(submodule)、`.gitmodules`、`_plugins/posts-lastmod-hook.rb`、`_data/contact.yml`、`_data/share.yml`、`_tabs/archives.md`、`_tabs/tags.md`、`_includes/update-list.html`、`_includes/search-loader.html`、`_includes/metadata-hook.html`、`_includes/share-link.html`、`_layouts/archives.html`、`_layouts/tag.html`、`assets/js/data/search.json`、`assets/css/jekyll-theme-chirpy.scss`

**Interfaces:**
- Produces:
  - `{% include slot.html name="<slot>" post=<post> %}`:插槽,`<slot>` ∈ `header-tools` / `before-shelf` / `after-shelf` / `card-meta` / `footer`
  - 每個啟用的模組 `<m>` 都會在每頁載入 `/assets/modules/<m>/<m>.css` 與 `/assets/modules/<m>/<m>.js`(`defer`)
  - `site.nav`:導覽項目陣列 `{title, url, module?}`;有 `module` 的項目只在該模組啟用時顯示
  - `site.intro`:首頁的一句自介
  - `<html data-theme="light|dark">`:由 head 內的行內 script 在繪製前設定(沒存過偏好且 `appearance.mode` 是 system 時不設)

- [ ] **Step 1: 改 `Gemfile`**

```ruby
# frozen_string_literal: true

source "https://rubygems.org"

gem "jekyll", "~> 4.4"

group :jekyll_plugins do
  gem "jekyll-seo-tag", "~> 2.8"
  gem "jekyll-sitemap", "~> 1.4"
end

gem "html-proofer", "~> 5.0", group: :test

platforms :windows, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

gem "wdm", "~> 0.2.0", :platforms => [:windows]
```

- [ ] **Step 2: 整份改寫 `_config.yml`**

```yaml
# 站台設定。個人資料都放這裡或 _data/,版面裡不寫死。

lang: zh-TW
timezone: Asia/Taipei

title: Randy Xu
description: >-
  Randy Xu 的個人頁:自己的 projects,與轉發的技術文章。
intro: 嗨,我是 Randy。這裡放我讀到、覺得值得一看的技術文章,以及我讀過的書。
url: "https://randyxu0711.github.io"
baseurl: ""

author:
  name: Randy Xu
  email: randy970711@gmail.com
github:
  username: randyxu0711

nav:
  - { title: 分享, url: / }
  - { title: 書架, url: /books/, module: books }
  - { title: 關於, url: /about/ }

appearance:
  hue: 72          # 主色色相
  chroma: 0.15     # 彩度
  mode: system     # system / light / dark,訪客可再切換
  rim: 9px         # 一般卡片框厚;精選 = rim × 4/3,精簡 = rim × 5/9

modules:           # 註解掉一行 = 關掉一個功能
  shelf-filter: { slots: [before-shelf] }
  seen:         { slots: [card-meta, footer] }
  archive:      { slots: [card-meta] }
  books:        { slots: [] }

books:
  default_view: spines   # spines / covers
  hide_shelf: hide

plugins:
  - jekyll-seo-tag
  - jekyll-sitemap

collections:
  posts:
    output: false        # share 不產生內部頁,所有列表直接連原文
  tabs:
    output: true
    sort_by: order

defaults:
  - scope: { path: "", type: tabs }
    values: { layout: page, permalink: /:title/ }

exclude:
  - docs
  - tools
  - books
  - CLAUDE.md
  - README.md
  - LICENSE
  - Gemfile
  - Gemfile.lock
  - "*.gem"
  - "*.gemspec"
```

- [ ] **Step 3: `.gitignore` 加上 Goodreads CSV**

在檔案最後加:

```
# Goodreads 匯出檔含 Private Notes 與完整書單,永遠不進 repo
books/
```

- [ ] **Step 4: 刪掉 Chirpy 相關檔案**

```bash
git rm -q -f assets/lib                     # submodule 的 gitlink;同時從 .gitmodules 移除這筆
rm -rf .git/modules/assets/lib
[ -s .gitmodules ] || git rm -q -f .gitmodules
git rm -q _plugins/posts-lastmod-hook.rb _data/contact.yml _data/share.yml \
  _tabs/archives.md _tabs/tags.md \
  _includes/update-list.html _includes/search-loader.html _includes/metadata-hook.html _includes/share-link.html \
  _layouts/archives.html _layouts/tag.html \
  assets/js/data/search.json assets/css/jekyll-theme-chirpy.scss
```

- [ ] **Step 5: 建立 `_includes/head.html`**

```liquid
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{% seo %}
<link rel="alternate" type="application/atom+xml" title="{{ site.title }}" href="{{ '/feed.xml' | relative_url }}">
<link rel="icon" href="{{ '/assets/img/favicons/favicon.svg' | relative_url }}" type="image/svg+xml">
<link rel="icon" href="{{ '/assets/img/favicons/favicon-96x96.png' | relative_url }}" sizes="96x96" type="image/png">
<link rel="icon" href="{{ '/assets/img/favicons/favicon.ico' | relative_url }}" sizes="any">
<link rel="apple-touch-icon" href="{{ '/assets/img/favicons/apple-touch-icon.png' | relative_url }}">
<script>
  // 繪製前套用主題,避免閃一下另一個主題
  (function () {
    var t = null;
    try { t = localStorage.getItem('theme'); } catch (e) {}
    if (t !== 'light' && t !== 'dark') t = '{{ site.appearance.mode | default: "system" }}';
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  })();
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap">
<link rel="stylesheet" href="{{ '/assets/css/tokens.css' | relative_url }}">
<link rel="stylesheet" href="{{ '/assets/css/gel.css' | relative_url }}">
<link rel="stylesheet" href="{{ '/assets/css/site.css' | relative_url }}">
{%- for m in site.modules %}
<link rel="stylesheet" href="{{ '/assets/modules/' | append: m[0] | append: '/' | append: m[0] | append: '.css' | relative_url }}">
<script defer src="{{ '/assets/modules/' | append: m[0] | append: '/' | append: m[0] | append: '.js' | relative_url }}"></script>
{%- endfor %}
<script defer src="{{ '/assets/js/theme.js' | relative_url }}"></script>
```

- [ ] **Step 6: 建立 `_includes/nav.html`**

```liquid
<header class="nav">
  <div class="nav-inner">
    <a class="nav-name" href="{{ '/' | relative_url }}">{{ site.title }}</a>
    <nav aria-label="主要">
      <ul class="nav-links">
        {%- for item in site.nav -%}
          {%- if item.module -%}
            {%- unless site.modules[item.module] -%}{%- continue -%}{%- endunless -%}
            {%- assign book_count = site.data.books | size -%}
            {%- if item.module == 'books' and book_count == 0 -%}{%- continue -%}{%- endif -%}
          {%- endif -%}
          {%- assign here = false -%}
          {%- if page.url == item.url -%}{%- assign here = true -%}{%- endif -%}
          <li><a href="{{ item.url | relative_url }}"{% if here %} aria-current="page"{% endif %}>{{ item.title }}</a></li>
        {%- endfor -%}
      </ul>
    </nav>
    <div class="nav-tools">
      {% include slot.html name="header-tools" %}
      <div class="seg" role="group" aria-label="主題" data-theme-switch hidden>
        <button type="button" data-theme-set="system" aria-pressed="true">跟系統</button>
        <button type="button" data-theme-set="light" aria-pressed="false">晝</button>
        <button type="button" data-theme-set="dark" aria-pressed="false">夜</button>
      </div>
    </div>
  </div>
</header>
```

- [ ] **Step 7: 建立 `_includes/footer.html`**

```liquid
<footer class="footer">
  <div class="footer-inner">
    <span>© {{ site.time | date: '%Y' }} {{ site.author.name }}</span>
    <a href="{{ '/feed.xml' | relative_url }}">Atom feed</a>
    {% include slot.html name="footer" %}
  </div>
</footer>
```

- [ ] **Step 8: 建立 `_includes/slot.html`**

```liquid
{%- comment -%}
  插槽:把啟用中、有宣告這個插槽的模組片段插進來。
  用法:{% include slot.html name="card-meta" post=post %}
{%- endcomment -%}
{%- for m in site.modules -%}
  {%- if m[1].slots contains include.name -%}
    {%- capture slot_path -%}modules/{{ m[0] }}/{{ include.name }}.html{%- endcapture -%}
    {%- include {{ slot_path }} post=include.post -%}
  {%- endif -%}
{%- endfor -%}
```

- [ ] **Step 9: 建立 `_layouts/default.html` 與 `_layouts/page.html`**

`_layouts/default.html`:

```liquid
<!doctype html>
<html lang="{{ site.lang }}">
<head>
{% include head.html %}
</head>
<body>
{% include nav.html %}
<main class="main" id="main">
{{ content }}
</main>
{% include footer.html %}
</body>
</html>
```

`_layouts/page.html`:

```liquid
---
layout: default
---
<article class="page">
  <h1 class="page-title">{{ page.title }}</h1>
  <div class="page-body">
    {{ content }}
  </div>
</article>
```

- [ ] **Step 10: 暫時版 `_layouts/home.html`**(Task 3 會整個換掉)

```liquid
---
layout: default
---
<ul>
{%- for p in site.posts -%}
  <li><a href="{{ p.link | escape }}" target="_blank" rel="noopener">{{ p.title }}</a></li>
{%- endfor -%}
</ul>
```

`index.html` 維持:

```liquid
---
layout: home
---
```

- [ ] **Step 11: 建立 `feed.xml` 與 `404.html`**

`feed.xml`:

```liquid
---
layout: null
permalink: /feed.xml
sitemap: false
---
<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>{{ site.title | xml_escape }}</title>
  <link href="{{ '/feed.xml' | absolute_url }}" rel="self"/>
  <link href="{{ '/' | absolute_url }}"/>
  <id>{{ '/' | absolute_url }}</id>
  <updated>{{ site.time | date_to_xmlschema }}</updated>
  <author><name>{{ site.author.name | xml_escape }}</name></author>
  {%- for p in site.posts limit: 30 %}
  <entry>
    <title>{{ p.title | xml_escape }}</title>
    <link href="{{ p.link | xml_escape }}"/>
    <id>{{ p.link | xml_escape }}</id>
    <updated>{{ p.date | date_to_xmlschema }}</updated>
    <summary>{{ p.note | default: p.description | xml_escape }}</summary>
    {%- for t in p.tags %}<category term="{{ t | xml_escape }}"/>{% endfor %}
  </entry>
  {%- endfor %}
</feed>
```

`404.html`:

```liquid
---
layout: page
title: 找不到這一頁
permalink: /404.html
sitemap: false
---
<p>這個網址沒有內容。回到<a href="{{ '/' | relative_url }}">首頁</a>看看最近分享的文章。</p>
```

- [ ] **Step 12: 建立模組樁檔與空白樣式檔**

```bash
mkdir -p _includes/modules/{shelf-filter,seen,archive} assets/modules/{shelf-filter,seen,archive,books} assets/js
echo '{%- comment -%} shelf-filter:Task 4 實作 {%- endcomment -%}' > _includes/modules/shelf-filter/before-shelf.html
echo '{%- comment -%} seen:Task 5 實作 {%- endcomment -%}' > _includes/modules/seen/card-meta.html
echo '{%- comment -%} seen:Task 5 實作 {%- endcomment -%}' > _includes/modules/seen/footer.html
echo '{%- comment -%} archive:Task 10 實作 {%- endcomment -%}' > _includes/modules/archive/card-meta.html
for m in shelf-filter seen archive books; do
  echo "/* $m */" > assets/modules/$m/$m.css
  echo "// $m" > assets/modules/$m/$m.js
done
printf -- '---\n---\n' > assets/css/tokens.css
: > assets/css/gel.css; : > assets/css/site.css; : > assets/js/theme.js
```

- [ ] **Step 13: 建置並驗證**

Run: `JEKYLL_BUILD`(見 Global Constraints)
Expected: 建置成功、htmlproofer 通過。

再跑:

```bash
test ! -e _site/posts && echo "OK: 沒有內部 post 頁"
ls _site                      # 應有 index.html about/ feed.xml sitemap.xml 404.html assets/
grep -c "<entry>" _site/feed.xml   # 應等於 _posts 的檔案數(目前 4)
grep -ril chirpy _site --include=*.html | wc -l   # 0
grep -o '<loc>[^<]*' _site/sitemap.xml   # 只有 / 與 /about/
```

若 `_site/posts` 仍存在:`collections.posts.output: false` 沒生效,改在 `_plugins/no-post-output.rb` 加:

```ruby
# share 只當資料用,不輸出內部頁
Jekyll::Hooks.register :posts, :pre_render do |post|
  post.data["permalink"] = nil
end
Jekyll::Hooks.register :site, :post_render do |site|
  site.posts.docs.each { |d| d.output = nil }
end
```

(只有前一個做法失敗才加,並把結果寫進 commit 訊息。)

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "refactor: 拿掉 Chirpy,改成自己的 Jekyll 版面骨架與模組插槽

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Token、膠框材質、主題切換

**Files:**
- Modify: `assets/css/tokens.css`、`assets/css/gel.css`、`assets/css/site.css`、`assets/js/theme.js`

**Interfaces:**
- Consumes: Task 1 的 `data-theme`、`[data-theme-switch]` 按鈕組
- Produces(CSS,之後所有 task 只能用這些):
  - 語意 token:`--ground --ground-2 --ink --ink-2 --accent --well --well-line --well-shade --resin --resin-base --edge-hi --edge-lo --edge-line --glow --drop --chip --sheen`
  - 尺寸 token:`--t-xs --t-sm --t-md --t-lg --t-xl --t-2xl --t-3xl`、`--rim-card --rim-feature --rim-compact`、`--r-frame`、`--font-ui --font-code`
  - 材質 class:`.gel`(外框,`--rim` 決定框厚,`--img` 決定透光圖)、`.well`(內容區)
  - 共用小元件:`.tag`(膠囊標籤)、`.seg`(分段按鈕)、`.linkbtn`、`.visually-hidden`

- [ ] **Step 1: 寫 `assets/css/tokens.css`**

內容 = 下面的 front matter 與第 1 層,接著貼上 `docs/redesign/mockups/amber-cards.html` 第 25–89 行(兩個「第 2 層:語意 token」區塊,晝與夜),再做第 2、3 點的修改:

1. 檔頭(取代 mockup 第 8–23 行的第 1 層,數值改成從設定注入):

```css
---
---
/* 第 1 層:原始值。數值來自 _config.yml 的 appearance,template 使用者只改那裡 */
:root {
  --h: {{ site.appearance.hue | default: 72 }};
  --c: {{ site.appearance.chroma | default: 0.15 }};
  --h-cool: calc(var(--h) + 190);

  --font-ui: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif;
  --font-code: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;

  --t-xs: 0.8rem; --t-sm: 0.875rem; --t-md: 1rem; --t-lg: 1.25rem;
  --t-xl: 1.5625rem; --t-2xl: 1.953rem; --t-3xl: 2.441rem;

  --rim-card: {{ site.appearance.rim | default: '9px' }};
  --rim-feature: calc(var(--rim-card) * 4 / 3);
  --rim-compact: calc(var(--rim-card) * 5 / 9);
  --r-frame: 20px;
}
```

2. 第 2 層裡的 `:root, .scope-day {` 改成 `:root {`。
3. `:root[data-theme="dark"], .scope-night {` 改成 `:root[data-theme="dark"] {`(第 90 行 `.scope-day, .scope-night {…}` 不要貼)。

- [ ] **Step 2: 寫 `assets/css/gel.css`**

```css
/* 膠框材質:樹脂框 + 上亮下暗的邊緣 + 內凹的內容區 + 縮圖透光。只用語意 token。 */
.gel {
  --rim: var(--rim-card);
  position: relative; isolation: isolate; overflow: hidden;
  display: block; color: inherit; text-decoration: none;
  border-radius: var(--r-frame);
  padding: var(--rim);
  background: var(--resin-base);
  box-shadow:
    inset 0 1px 0 0 var(--edge-hi),
    inset 0 -2px 3px -1px var(--edge-lo),
    inset 0 0 0 1px var(--edge-line),
    0 1px 2px var(--drop),
    0 18px 34px -14px var(--glow),
    0 28px 56px -30px var(--drop);
  transition: transform 220ms cubic-bezier(.2,.7,.2,1), box-shadow 220ms;
}
/* 縮圖暈進膠框:每張卡的框色來自它自己的圖 */
.gel::before {
  content: ""; position: absolute; inset: -24px; z-index: -1;
  background:
    linear-gradient(170deg, var(--sheen) 0%, transparent 28%),
    linear-gradient(var(--resin), var(--resin)),
    var(--img, linear-gradient(transparent, transparent)) center / cover;
  filter: blur(14px) saturate(1.35);
}
/* 跟著游標走的高光(--mx / --my 由 site.css 的 pointer 處理設定) */
.gel::after {
  content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none; border-radius: inherit;
  background: radial-gradient(28rem circle at var(--mx, 30%) var(--my, 0%), var(--sheen), transparent 45%);
  mix-blend-mode: soft-light; opacity: 0; transition: opacity 220ms;
}
a.gel:hover, a.gel:focus-visible, button.gel:hover, button.gel:focus-visible {
  transform: translateY(-3px);
  box-shadow:
    inset 0 1px 0 0 var(--edge-hi), inset 0 -2px 3px -1px var(--edge-lo), inset 0 0 0 1px var(--edge-line),
    0 1px 2px var(--drop), 0 26px 44px -16px var(--glow), 0 36px 64px -30px var(--drop);
}
a.gel:hover::after, a.gel:focus-visible::after, button.gel:hover::after, button.gel:focus-visible::after { opacity: 1; }
.gel:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }

.well {
  position: relative; overflow: hidden;
  border-radius: calc(var(--r-frame) - var(--rim));
  background: var(--well);
}
.well::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  box-shadow: inset 0 2px 5px var(--well-shade), inset 0 0 0 1px var(--well-line);
}

@media (prefers-reduced-motion: reduce) {
  .gel, .gel::after { transition: none; }
  a.gel:hover, a.gel:focus-visible, button.gel:hover, button.gel:focus-visible { transform: none; }
}
@media (prefers-reduced-transparency: reduce) {
  .gel::before { filter: none; background: var(--resin-base); }
}
@media (forced-colors: active) {
  .gel { border: 2px solid CanvasText; }
  .gel::before, .gel::after { display: none; }
}
@supports not (color: oklch(0.5 0.1 70)) {
  :root { --resin-base: #c9902e; --well: #fbfaf7; --ink: #1d1a16; --ink-2: #5d564c; --accent: #8a5a00; --ground: #e9ebee; }
}
```

- [ ] **Step 3: 寫 `assets/css/site.css`(基礎、導覽、頁面、共用小元件)**

```css
/* 版面與共用元件。只用語意 token。 */
html { font-size: 16px; }
body {
  margin: 0; background: var(--ground); color: var(--ink);
  font-family: var(--font-ui); font-size: var(--t-md); line-height: 1.75;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
h1, h2, h3 { text-wrap: balance; line-height: 1.35; }
img { max-width: 100%; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.main { max-width: 72rem; margin: 0 auto; padding: 2rem 16px 5rem; }

/* 導覽列 */
.nav {
  position: sticky; top: env(safe-area-inset-top, 0px); z-index: 10;
  background: color-mix(in oklch, var(--ground) 82%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--well-line);
}
.nav-inner { max-width: 72rem; margin: 0 auto; padding: 0.6rem 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1.5rem; }
.nav-name { font-weight: 700; color: var(--ink); text-decoration: none; }
.nav-links { display: flex; gap: 1.1rem; list-style: none; margin: 0; padding: 0; }
.nav-links a { color: var(--ink-2); text-decoration: none; }
.nav-links a[aria-current="page"] { color: var(--ink); font-weight: 500; }
.nav-links a:hover { color: var(--ink); }
.nav-tools { margin-left: auto; display: flex; align-items: center; gap: 0.75rem; }

/* 分段按鈕、文字按鈕、膠囊標籤 */
.seg { display: inline-flex; border-radius: 999px; padding: 3px; background: var(--chip); gap: 2px; }
.seg button { font: inherit; font-size: var(--t-sm); color: var(--ink-2); background: none; border: 0; border-radius: 999px; padding: 0.15rem 0.8rem; cursor: pointer; }
.seg button[aria-pressed="true"] { background: var(--well); color: var(--ink); box-shadow: 0 1px 2px var(--drop); }
.linkbtn { font: inherit; background: none; border: 0; color: var(--accent); cursor: pointer; padding: 0; text-decoration: underline; text-underline-offset: 3px; }
.tag { font-size: var(--t-xs); padding: 0.1rem 0.6rem; border-radius: 999px; background: var(--chip); color: var(--ink); white-space: nowrap; }
.tags { display: flex; flex-wrap: wrap; gap: 0.4rem; }

/* 一般頁 */
.page { max-width: 46rem; }
.page-title { font-size: var(--t-2xl); margin: 0 0 1.5rem; }
.page-body { color: var(--ink); }
.page-body h2 { font-size: var(--t-xl); margin: 2.5rem 0 0.75rem; }
.page-body p, .page-body li { color: var(--ink-2); }
.page-body strong { color: var(--ink); font-weight: 500; }

.empty { color: var(--ink-2); font-size: var(--t-sm); }

/* footer */
.footer { border-top: 1px solid var(--well-line); }
.footer-inner { max-width: 72rem; margin: 0 auto; padding: 1.5rem 16px 2.5rem; display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; font-size: var(--t-sm); color: var(--ink-2); }
.footer-inner a { color: var(--ink-2); }
```

- [ ] **Step 4: 寫 `assets/js/theme.js`**

```js
// 主題切換:跟系統 / 晝 / 夜。偏好存在 localStorage('theme'),head 的行內 script 負責繪製前套用。
(function () {
  var group = document.querySelector('[data-theme-switch]');
  if (!group) return;
  var root = document.documentElement;
  var buttons = group.querySelectorAll('[data-theme-set]');
  function current() { return root.getAttribute('data-theme') || 'system'; }
  function paint() {
    var c = current();
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === c)); });
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-theme-set');
      if (v === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', v);
      try { localStorage.setItem('theme', v); } catch (e) {}
      paint();
    });
  });
  group.hidden = false;
  paint();

  // 膠框高光跟著游標
  document.addEventListener('pointermove', function (e) {
    var card = e.target.closest && e.target.closest('.gel');
    if (!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
  });
})();
```

注意:`head.html` 存的是 `light` / `dark` / `system`;`system` 時行內 script 不設 `data-theme`。

- [ ] **Step 5: 建置並驗證**

Run: `JEKYLL_BUILD`
Expected: 成功。再檢查 Liquid 有注入數值、沒有殘留的設計稿選擇器:

```bash
grep -E "^\s*--h: 72;" _site/assets/css/tokens.css && echo OK
grep -c "scope-day\|scope-night\|font-note" _site/assets/css/tokens.css   # 0
```

預覽後在 Brave 確認:主題切換三個狀態都會換色、重新整理後記得選擇、切到「跟系統」後跟著 Windows 的深淺設定。

- [ ] **Step 6: Commit**

```bash
git add assets/css assets/js/theme.js
git commit -m "feat: 三層 token、膠框材質與主題切換

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: share 卡片與書架首頁

**Files:**
- Create: `_includes/share-card.html`
- Modify: `_layouts/home.html`(整份換掉)、`assets/css/site.css`(append)

**Interfaces:**
- Consumes: `.gel` `.well` `.tag`(Task 2)、`slot.html`(Task 1)
- Produces(Task 4 / 5 / 10 依賴這些 DOM 約定):
  - 每則 share = `<article class="share" data-tags="AI/LLM|Security" data-text="<小寫的標題 來源 心得 摘要>" data-link="<原文網址>">`
  - 裡面的連結 = `<a class="gel share-card <variant>" href="…" target="_blank" rel="noopener">`;失效時多一個 class `is-dead`
  - 卡片 meta 列 = `<div class="share-meta">`,裡面 `<span class="src">` 之後呼叫 `slot.html name="card-meta"`
  - 首頁容器:`<section class="shelf" id="shelf">`;精選卡在 `.shelf-feature`,其他在 `#shelf-grid`
  - `{% include share-card.html post=p variant="feature|card|compact" %}`

- [ ] **Step 1: 建立 `_includes/share-card.html`**

```liquid
{%- comment -%}
  share 卡。參數:post、variant(feature / card / compact,預設 card)。
  整張卡片直接開原文;linkcheck 判定失效且有 archive 時改連封存版。
{%- endcomment -%}
{%- assign p = include.post -%}
{%- assign variant = include.variant | default: 'card' -%}
{%- capture lc_key -%}{{ p.issue }}{%- endcapture -%}
{%- assign lc = site.data.linkcheck[lc_key] -%}
{%- assign dead = false -%}
{%- if site.modules.archive and lc.dead and p.archive -%}{%- assign dead = true -%}{%- endif -%}
{%- assign href = p.link -%}
{%- if dead -%}{%- assign href = p.archive -%}{%- endif -%}
{%- capture text -%}{{ p.title }} {{ p.source }} {{ p.note }} {{ p.description }}{%- endcapture -%}
<article class="share" data-tags="{{ p.tags | join: '|' | escape }}" data-text="{{ text | strip_newlines | downcase | escape }}" data-link="{{ p.link | escape }}">
  <a class="gel share-card {{ variant }}{% if dead %} is-dead{% endif %}" href="{{ href | escape }}" target="_blank" rel="noopener"
     {%- if p.image %} style="--img: url('{{ p.image | replace: "'", "%27" | escape }}')"{% endif %}>
    <div class="well">
      {%- if p.image %}
      <img class="thumb" src="{{ p.image | escape }}" alt="" loading="lazy" decoding="async" onerror="this.remove()">
      {%- endif %}
      <div class="share-body">
        <div class="share-meta">
          <span class="src">{{ p.source }}{% include slot.html name="card-meta" post=p %}</span>
          <time datetime="{{ p.date | date: '%Y-%m-%d' }}">{{ p.date | date: '%Y-%m-%d' }}</time>
        </div>
        {%- if variant == 'feature' %}
        <h2 class="share-title">{{ p.title | escape }}</h2>
        {%- else %}
        <h3 class="share-title">{{ p.title | escape }}</h3>
        {%- endif %}
        {%- if variant != 'compact' %}
          {%- if p.note %}
        <p class="share-note">{{ p.note | escape | newline_to_br }}</p>
          {%- elsif p.description %}
        <p class="share-desc">{{ p.description | escape }}</p>
          {%- endif %}
          {%- if p.tags.size > 0 %}
        <div class="tags">{% for t in p.tags %}<span class="tag">{{ t | escape }}</span>{% endfor %}</div>
          {%- endif %}
        {%- endif %}
      </div>
    </div>
  </a>
</article>
```

- [ ] **Step 2: 整份換掉 `_layouts/home.html`**

```liquid
---
layout: default
---
{%- assign posts = site.posts -%}
<section class="shelf" id="shelf" aria-label="分享的文章">
  {%- if site.intro %}
  <p class="intro">{{ site.intro }}</p>
  {%- endif %}
  {% include slot.html name="before-shelf" %}
  {%- if posts.size == 0 %}
  <p class="empty">還沒有分享的文章。開一個「分享文章」issue,就會出現在這裡。</p>
  {%- else %}
  {%- assign first = posts | first %}
  {%- comment -%} include 的參數不接受 posts[0] 這種寫法,要先 assign {%- endcomment %}
  <div class="shelf-feature">{% include share-card.html post=first variant="feature" %}</div>
  <div class="grid" id="shelf-grid">
    {%- for p in posts offset: 1 %}
    {% include share-card.html post=p %}
    {%- endfor %}
  </div>
  {%- endif %}
  {% include slot.html name="after-shelf" %}
</section>
```

- [ ] **Step 3: `assets/css/site.css` 最後加上卡片與首頁樣式**

```css
/* ── share 卡 ── */
.intro { color: var(--ink-2); font-size: var(--t-lg); max-width: 38rem; margin: 0.5rem 0 2rem; }
.shelf { display: grid; gap: 1.75rem; }
.share { min-width: 0; }
.share-card .thumb { display: block; width: 100%; aspect-ratio: 1.91 / 1; object-fit: cover; }
.share-body { display: grid; gap: 0.6rem; padding: 1rem 1.15rem 1.15rem; min-width: 0; }
.share-meta { display: flex; justify-content: space-between; gap: 1rem; font-size: var(--t-xs); color: var(--ink-2); }
.share-meta .src { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.share-meta time { font-variant-numeric: tabular-nums; white-space: nowrap; }
.share-title { margin: 0; font-size: var(--t-lg); font-weight: 700; line-height: 1.45; overflow-wrap: anywhere; color: var(--ink); }
.share-note { margin: 0; font-size: var(--t-md); line-height: 1.8; color: var(--ink); }
.share-desc { margin: 0; font-size: var(--t-sm); line-height: 1.7; color: var(--ink-2);
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

/* 精選:橫式,框最厚 */
.share-card.feature { --rim: var(--rim-feature); }
.share-card.feature .well { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); }
.share-card.feature .thumb { aspect-ratio: auto; height: 100%; min-height: 16rem; }
.share-card.feature .share-body { padding: 1.5rem 1.6rem; align-content: center; gap: 0.85rem; }
.share-card.feature .share-title { font-size: var(--t-xl); }
.share-card.feature .well:not(:has(.thumb)) { grid-template-columns: 1fr; }
@media (max-width: 720px) {
  .share-card.feature .well { grid-template-columns: 1fr; }
  .share-card.feature .thumb { aspect-ratio: 1.91 / 1; height: auto; min-height: 0; }
  .share-card.feature .share-body { padding: 1.1rem 1.2rem 1.3rem; }
}

/* 精簡:框最薄 */
.share-card.compact { --rim: var(--rim-compact); --r-frame: 14px; }
.share-card.compact .well { display: grid; grid-template-columns: 8.5rem minmax(0, 1fr); }
.share-card.compact .thumb { aspect-ratio: auto; height: 100%; min-height: 4.6rem; }
.share-card.compact .share-body { padding: 0.7rem 0.95rem; gap: 0.25rem; }
.share-card.compact .share-title { font-size: var(--t-md); }
.share-card.compact .well:not(:has(.thumb)) { grid-template-columns: 1fr; }

/* 格狀 */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr)); gap: 1.75rem; align-items: start; }
```

- [ ] **Step 4: 用刁難的暫時 post 建置驗證(Review Focus 1、2)**

建立 `_posts/2000-01-01-share-9999.md`(**驗證完刪掉,不要 commit**):

```markdown
---
title: "Edge <b>case</b> & \"quotes\""
date: "2000-01-01 00:00:00 +0800"
link: "https://example.com/a?x=1&y=2"
source: "example.com"
image: "https://example.com/it's (1).png"
note: "第一行 <script>alert(1)</script>\n第二行"
tags: ["AI/LLM", "Programming Languages"]
issue: 9999
---
```

再建立 `_posts/2000-01-02-share-9998.md`(最精簡的 share):

```markdown
---
title: "https://example.com/bare"
date: "2000-01-02 00:00:00 +0800"
link: "https://example.com/bare"
source: "example.com"
issue: 9998
---
```

Run: `JEKYLL_BUILD`
Expected: 成功,再檢查:

```bash
grep -c '<script>alert' _site/index.html                       # 0(note 被跳脫)
grep -o "style=\"--img: url('https://example.com/it%27s (1).png')\"" _site/index.html   # 有一筆
grep -A3 'data-link="https://example.com/bare"' _site/index.html | grep -c 'class="thumb"'   # 0
grep -c 'data-tags="AI/LLM|Programming Languages"' _site/index.html   # 1
rm _posts/2000-01-01-share-9999.md _posts/2000-01-02-share-9998.md
```

預覽後在 Brave 確認(桌機寬與手機寬,晝夜各一次):精選卡橫式、手機變直式;格狀卡片高度隨內容;縮圖透進框;沒圖的卡片框是純琥珀色;Tab 鍵每張卡都有焦點框。

- [ ] **Step 5: Commit**

```bash
git add _includes/share-card.html _layouts/home.html assets/css/site.css
git commit -m "feat: share 膠框卡片與書架首頁(精選卡 + 格狀)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: shelf-filter 模組

**Files:**
- Modify: `_includes/modules/shelf-filter/before-shelf.html`、`assets/modules/shelf-filter/shelf-filter.js`、`assets/modules/shelf-filter/shelf-filter.css`

**Interfaces:**
- Consumes: Task 3 的 `article.share[data-tags][data-text]`、`a.share-card`、`#shelf`
- Produces: 網址 hash 格式 `#tags=<encodeURIComponent(tag)>,<…>&q=<encodeURIComponent(文字)>`(空的部分省略;都空時清掉 hash)

- [ ] **Step 1: `_includes/modules/shelf-filter/before-shelf.html`**

```liquid
{%- comment -%} 書架篩選:tag 複選(AND)+ 文字篩選。JS 啟動前保持 hidden。 {%- endcomment -%}
<div class="filters" id="shelf-filters" hidden>
  <label class="filter-q" for="shelf-q">
    <span class="visually-hidden">篩選文章</span>
    <input id="shelf-q" type="search" placeholder="篩選標題、來源、心得" autocomplete="off" enterkeyhint="search">
  </label>
  <div class="chips" role="group" aria-label="依 tag 篩選">
    {%- assign names = "" | split: "" -%}
    {%- for t in site.tags -%}{%- assign names = names | push: t[0] -%}{%- endfor -%}
    {%- assign names = names | sort -%}
    {%- for name in names %}
    <button type="button" class="chipbtn" data-tag="{{ name | escape }}" aria-pressed="false">{{ name | escape }}<span class="n">{{ site.tags[name].size }}</span></button>
    {%- endfor %}
  </div>
  <span class="count" id="shelf-count" aria-live="polite"></span>
</div>
<p class="empty" id="shelf-empty" hidden>沒有符合的文章。少選一個 tag,或把篩選文字改短試試。</p>
<p class="keys" id="shelf-keys" hidden><kbd>/</kbd> 篩選 <kbd>j</kbd> <kbd>k</kbd> 下一則、上一則 <kbd>Enter</kbd> 開原文</p>
```

- [ ] **Step 2: `assets/modules/shelf-filter/shelf-filter.js`**

```js
// 書架篩選:tag 複選(AND)、文字篩選、狀態寫進網址 hash、j/k/Enter// 鍵盤操作。
(function () {
  var box = document.getElementById('shelf-filters');
  if (!box) return;
  var items = Array.prototype.slice.call(document.querySelectorAll('#shelf article.share'));
  var chips = Array.prototype.slice.call(box.querySelectorAll('.chipbtn'));
  var q = document.getElementById('shelf-q');
  var count = document.getElementById('shelf-count');
  var empty = document.getElementById('shelf-empty');

  function readHash() {
    var out = { tags: [], q: '' };
    location.hash.replace(/^#/, '').split('&').forEach(function (part) {
      var i = part.indexOf('=');
      if (i < 0) return;
      var k = part.slice(0, i), v = part.slice(i + 1);
      try {
        if (k === 'tags' && v) out.tags = v.split(',').map(decodeURIComponent);
        if (k === 'q') out.q = decodeURIComponent(v);
      } catch (e) { /* 壞掉的 hash 就忽略 */ }
    });
    return out;
  }
  function writeHash(tags, text) {
    var parts = [];
    if (tags.length) parts.push('tags=' + tags.map(encodeURIComponent).join(','));
    if (text) parts.push('q=' + encodeURIComponent(text));
    var h = parts.length ? '#' + parts.join('&') : location.pathname + location.search;
    history.replaceState(null, '', h);
  }
  function selected() {
    return chips.filter(function (c) { return c.getAttribute('aria-pressed') === 'true'; })
      .map(function (c) { return c.getAttribute('data-tag'); });
  }
  function apply() {
    var tags = selected();
    var text = q.value.trim().toLowerCase();
    var n = 0;
    items.forEach(function (it) {
      var have = (it.getAttribute('data-tags') || '').split('|');
      var ok = tags.every(function (t) { return have.indexOf(t) !== -1; }) &&
               (!text || (it.getAttribute('data-text') || '').indexOf(text) !== -1);
      it.hidden = !ok;
      if (ok) n++;
    });
    count.textContent = n + ' 則';
    empty.hidden = n !== 0;
    writeHash(tags, q.value.trim());
  }

  var init = readHash();
  chips.forEach(function (c) {
    if (init.tags.indexOf(c.getAttribute('data-tag')) !== -1) c.setAttribute('aria-pressed', 'true');
    c.addEventListener('click', function () {
      c.setAttribute('aria-pressed', String(c.getAttribute('aria-pressed') !== 'true'));
      apply();
    });
  });
  q.value = init.q;
  q.addEventListener('input', apply);

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if (e.key === '/' && !typing) { q.focus(); e.preventDefault(); return; }
    if (typing || (e.key !== 'j' && e.key !== 'k')) return;
    var cards = items.filter(function (it) { return !it.hidden; })
      .map(function (it) { return it.querySelector('a.share-card'); });
    if (!cards.length) return;
    var i = cards.indexOf(document.activeElement);
    i = e.key === 'j' ? Math.min(i + 1, cards.length - 1) : Math.max(i - 1, 0);
    cards[i].focus();
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cards[i].scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    e.preventDefault();
  });

  box.hidden = false;
  document.getElementById('shelf-keys').hidden = false;
  apply();
})();
```

(`Enter` 開原文不用寫:焦點在 `<a>` 上時瀏覽器本來就會開。)

- [ ] **Step 3: `assets/modules/shelf-filter/shelf-filter.css`**

```css
/* 書架篩選 */
.filters { display: flex; flex-wrap: wrap; gap: 0.6rem 0.75rem; align-items: center; }
.filter-q input {
  font: inherit; font-size: var(--t-sm); color: var(--ink);
  background: var(--well); border: 0; border-radius: 999px;
  padding: 0.35rem 0.9rem; width: min(18rem, 100%);
  box-shadow: inset 0 1px 2px var(--well-shade), 0 0 0 1px var(--well-line);
}
.chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.chipbtn { font: inherit; font-size: var(--t-sm); cursor: pointer; padding: 0.2rem 0.85rem; border-radius: 999px; border: 0; background: var(--chip); color: var(--ink); }
.chipbtn .n { color: var(--ink-2); font-variant-numeric: tabular-nums; margin-left: 0.3rem; }
.chipbtn[aria-pressed="true"] { background: var(--accent); color: var(--well); }
.chipbtn[aria-pressed="true"] .n { color: inherit; opacity: 0.8; }
.filters .count { margin-left: auto; font-size: var(--t-sm); color: var(--ink-2); font-variant-numeric: tabular-nums; }
.keys { margin: 0; font-size: var(--t-xs); color: var(--ink-2); }
.keys kbd { font-family: var(--font-code); padding: 0.05rem 0.4rem; border-radius: 5px; background: var(--well); color: var(--ink); box-shadow: 0 0 0 1px var(--well-line); }
@media (hover: none) { .keys { display: none; } }
```

- [ ] **Step 4: 建置與手動檢查(Review Focus 3)**

Run: `JEKYLL_BUILD`,Expected: 成功。預覽後逐項確認:

1. 點 `AI/LLM` → 只剩含 AI/LLM 的卡;網址變 `#tags=AI%2FLLM`。
2. 再點 `Security` → AND 條件;網址 `#tags=AI%2FLLM,Security`;重新整理後狀態還在。
3. 若站上有 `Programming Languages` 之類含空白的 tag:網址是 `Programming%20Languages`,重新整理後還原。
4. 篩選框輸入 `api` → 只剩標題/摘要含 api 的卡;清空後全部回來、hash 清掉。
5. 選到沒有結果 → 顯示「沒有符合的文章…」,數量 0 則。
6. 焦點不在輸入框時:`/` 聚焦篩選框;`j` / `k` 在可見的卡片間移動;`Enter` 開原文(新分頁)。
7. 在篩選框裡打 `j` 不會跳卡片。
8. 停用 JS(Brave 網站設定)→ 篩選列不出現,卡片照常可點。

- [ ] **Step 5: Commit**

```bash
git add _includes/modules/shelf-filter assets/modules/shelf-filter
git commit -m "feat(shelf-filter): 原地篩選 tag 與文字、狀態寫進網址、鍵盤操作

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: seen 模組

**Files:**
- Modify: `_includes/modules/seen/card-meta.html`、`_includes/modules/seen/footer.html`、`assets/modules/seen/seen.js`、`assets/modules/seen/seen.css`

**Interfaces:**
- Consumes: Task 3 的 `article.share[data-link]`、`a.share-card`
- Produces: `localStorage['seen-links']` = JSON 字串陣列(原文網址)

- [ ] **Step 1: 片段**

`_includes/modules/seen/card-meta.html`:

```liquid
<span class="seen-mark">,已開過</span>
```

`_includes/modules/seen/footer.html`:

```liquid
<button type="button" class="linkbtn" id="seen-clear" hidden>清除已開過的紀錄</button>
```

- [ ] **Step 2: `assets/modules/seen/seen.js`**

```js
// 已開過:記住訪客點過哪些原文,只存在訪客自己的瀏覽器。
(function () {
  var KEY = 'seen-links';
  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
  var seen = load();
  var clear = document.getElementById('seen-clear');

  function paint() {
    document.querySelectorAll('article.share[data-link]').forEach(function (it) {
      it.classList.toggle('is-seen', seen.indexOf(it.getAttribute('data-link')) !== -1);
    });
    if (clear) clear.hidden = seen.length === 0;
  }
  function record(e) {
    var a = e.target.closest && e.target.closest('a.share-card');
    if (!a) return;
    var link = a.closest('article.share').getAttribute('data-link');
    if (link && seen.indexOf(link) === -1) { seen.push(link); save(seen); }
    setTimeout(paint, 300);   // 等新分頁開了再變色,避免點下去那一刻卡片閃一下
  }

  document.addEventListener('click', record);
  document.addEventListener('auxclick', function (e) { if (e.button === 1) record(e); });   // 中鍵開新分頁也算
  if (clear) clear.addEventListener('click', function () { seen = []; save(seen); paint(); });
  paint();
})();
```

- [ ] **Step 3: `assets/modules/seen/seen.css`**

```css
/* 已開過 */
.seen-mark { display: none; }
.share.is-seen .seen-mark { display: inline; }
.share.is-seen .gel { --resin: var(--chip); --glow: transparent; }
.share.is-seen .share-title { color: var(--ink-2); }
```

- [ ] **Step 4: 建置與手動檢查**

Run: `JEKYLL_BUILD`,Expected: 成功。預覽:點一張卡 → 回到原分頁後該卡框色變淡、來源後面出現「,已開過」;重新整理還在;footer 出現「清除已開過的紀錄」,點了全部恢復、按鈕消失;Brave 私密視窗(或封鎖網站資料)下點卡片不報錯。

- [ ] **Step 5: Commit**

```bash
git add _includes/modules/seen assets/modules/seen
git commit -m "feat(seen): 記住訪客開過的文章

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: share.py 寫入 archive 並送存 Wayback

**Files:**
- Modify: `tools/share/share.py`
- Test: `tools/share/test_share.py`(**只新增測試,不改既有的**)

**Interfaces:**
- Produces:
  - `share.ARCHIVE_PREFIX = "https://web.archive.org/web/"`
  - `share.archive_url(link: str) -> str`
  - `share.save_to_wayback(link: str, opener=urllib.request.urlopen) -> str | None`(成功回 None,失敗回錯誤訊息)
  - `share.archive_warning(link: str, save=save_to_wayback) -> str`(成功回 `""`,失敗回要附加在留言的文字)
  - `Result` 多一個欄位 `link: str = ""`(published 時填原文網址)
  - post front matter 多 `archive`

- [ ] **Step 1: 寫失敗的測試**(加在 `tools/share/test_share.py` 最後)

```python
# --- archive ------------------------------------------------------------------

def test_build_post_writes_archive_url():
    fields = share.parse_issue_body(FORM_BODY)
    _, content = share.build_post(fields, META, 12, "2026-10-04T20:00:00Z")
    assert front_matter(content)["archive"] == "https://web.archive.org/web/https://example.com/post"


def test_handle_published_result_carries_link(tmp_path):
    r = share.handle(event("opened"), tmp_path, fetch=lambda u: (META, None))
    assert r.link == "https://example.com/post"


def test_archive_warning_empty_when_save_succeeds():
    assert share.archive_warning("https://a.com", save=lambda u: None) == ""


def test_archive_warning_explains_failure():
    msg = share.archive_warning("https://a.com", save=lambda u: "HTTP 520")
    assert "HTTP 520" in msg and "Wayback" in msg


def test_save_to_wayback_reports_errors_instead_of_raising():
    def boom(req, timeout):
        raise OSError("timed out")
    assert share.save_to_wayback("https://a.com", opener=boom) == "timed out"


def test_save_to_wayback_requests_save_endpoint():
    seen = {}

    class Resp:
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def fake(req, timeout):
        seen["url"] = req.full_url
        return Resp()
    assert share.save_to_wayback("https://a.com/x?y=1", opener=fake) is None
    assert seen["url"] == "https://web.archive.org/save/https://a.com/x?y=1"
```

- [ ] **Step 2: 確認測試失敗**

Run: `python3 -m pytest tools/share -q`
Expected: 新的 6 個 FAIL(`KeyError: 'archive'`、`AttributeError: ... 'link'`、`no attribute 'archive_warning'` 等),既有的全部 PASS。

- [ ] **Step 3: 實作**

在 `tools/share/share.py`:

1. 常數區(`USER_AGENT` 下面)加:

```python
ARCHIVE_PREFIX = "https://web.archive.org/web/"
```

2. `_domain` 下面加:

```python
def archive_url(link):
    """指向 Wayback 最新快照的固定網址;有沒有快照由 Wayback 決定。"""
    return ARCHIVE_PREFIX + link


def save_to_wayback(link, opener=urllib.request.urlopen):
    """請 Wayback 存一份。回傳 None 表示成功,否則回錯誤訊息;不丟例外,不擋發布。"""
    try:
        req = urllib.request.Request("https://web.archive.org/save/" + link,
                                     headers={"User-Agent": USER_AGENT})
        with opener(req, timeout=60):
            return None
    except Exception as e:  # 網路錯誤種類太多,一律回報
        return str(e) or type(e).__name__


def archive_warning(link, save=save_to_wayback):
    error = save(link)
    if not error:
        return ""
    return (f"\n\n注意:送存 Wayback Machine 失敗({error})。"
            "原文之後若失效,封存版可能沒有內容。")
```

3. `build_post` 的 `fm` 在 `"link"` 後面加一行:

```python
        "archive": archive_url(fields["url"]),
```

4. `Result` 加欄位:

```python
@dataclass
class Result:
    status: str
    comment: str = ""
    title: str = ""
    link: str = ""
```

5. `handle` 最後一行改成:

```python
    return Result("published", "\n".join(lines), title, fields["url"])
```

6. `main()` 在 `r = handle(event, sys.argv[1])` 下面加:

```python
    if r.status == "published":
        r.comment += archive_warning(r.link)
```

- [ ] **Step 4: 確認全部通過**

Run: `python3 -m pytest tools/share -q`
Expected: 全部 PASS;`git diff tools/share/test_share.py` 只有新增的行。

- [ ] **Step 5: Commit**

```bash
git add tools/share/share.py tools/share/test_share.py
git commit -m "feat(share): 發布時寫入 archive 欄位並送存 Wayback,失敗不擋發布

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 既有 share 補 archive 的遷移腳本

**Files:**
- Create: `tools/share/migrate_archive.py`
- Test: `tools/share/test_migrate_archive.py`

**Interfaces:**
- Consumes: `share.archive_url`、`share.save_to_wayback`(Task 6)
- Produces: `migrate_archive.migrate(posts_dir, save) -> list[Path]`(回傳改過的檔案)

- [ ] **Step 1: 寫失敗的測試** `tools/share/test_migrate_archive.py`

```python
import migrate_archive

POST = '''---
title: "T"
date: "2026-10-04 19:27:16 +0800"
link: "https://a.com/x"
source: "a.com"
tags: ["AI/LLM"]
issue: 1
render_with_liquid: false
---

[閱讀原文 →](https://a.com/x)
'''


def test_adds_archive_line_right_after_link(tmp_path):
    p = tmp_path / "2026-10-04-share-1.md"
    p.write_text(POST, encoding="utf-8")
    changed = migrate_archive.migrate(tmp_path, save=lambda u: None)
    assert changed == [p]
    lines = p.read_text(encoding="utf-8").splitlines()
    i = lines.index('link: "https://a.com/x"')
    assert lines[i + 1] == 'archive: "https://web.archive.org/web/https://a.com/x"'


def test_other_bytes_untouched(tmp_path):
    p = tmp_path / "2026-10-04-share-1.md"
    p.write_text(POST, encoding="utf-8")
    migrate_archive.migrate(tmp_path, save=lambda u: None)
    after = p.read_text(encoding="utf-8")
    assert after.replace('archive: "https://web.archive.org/web/https://a.com/x"\n', "") == POST


def test_second_run_changes_nothing_and_does_not_save(tmp_path):
    p = tmp_path / "2026-10-04-share-1.md"
    p.write_text(POST, encoding="utf-8")
    migrate_archive.migrate(tmp_path, save=lambda u: None)
    before = p.read_text(encoding="utf-8")
    calls = []
    assert migrate_archive.migrate(tmp_path, save=calls.append) == []
    assert calls == []
    assert p.read_text(encoding="utf-8") == before


def test_post_without_link_is_left_alone(tmp_path):
    p = tmp_path / "2026-10-04-share-2.md"
    p.write_text('---\ntitle: "x"\n---\n', encoding="utf-8")
    assert migrate_archive.migrate(tmp_path, save=lambda u: None) == []


def test_save_failure_still_writes_field(tmp_path):
    p = tmp_path / "2026-10-04-share-1.md"
    p.write_text(POST, encoding="utf-8")
    assert migrate_archive.migrate(tmp_path, save=lambda u: "HTTP 520") == [p]
    assert "archive:" in p.read_text(encoding="utf-8")
```

- [ ] **Step 2: 確認失敗**

Run: `python3 -m pytest tools/share/test_migrate_archive.py -q`
Expected: FAIL(`ModuleNotFoundError: No module named 'migrate_archive'`)

- [ ] **Step 3: 實作** `tools/share/migrate_archive.py`

```python
"""一次性遷移:替沒有 archive 欄位的 share 補上,並送存 Wayback。

用法: python migrate_archive.py <posts_dir>
只插入 archive 那一行,其他內容一個位元組都不動;跑第二次不會有任何改動。
"""

import json
import sys
from pathlib import Path

from share import archive_url, save_to_wayback


def migrate(posts_dir, save=save_to_wayback):
    changed = []
    for path in sorted(Path(posts_dir).glob("*.md")):
        text = path.read_text(encoding="utf-8")
        head, sep, rest = text.partition("\n---\n")
        if not text.startswith("---\n") or not sep:
            continue
        lines = head.split("\n")
        if any(line.startswith("archive: ") for line in lines):
            continue
        idx = next((i for i, line in enumerate(lines) if line.startswith("link: ")), None)
        if idx is None:
            continue
        link = json.loads(lines[idx][len("link: "):])
        error = save(link)
        if error:
            print(f"{path.name}: 送存 Wayback 失敗({error}),仍寫入 archive 欄位")
        lines.insert(idx + 1, "archive: " + json.dumps(archive_url(link), ensure_ascii=False))
        path.write_text("\n".join(lines) + sep + rest, encoding="utf-8")
        changed.append(path)
    return changed


if __name__ == "__main__":
    for p in migrate(sys.argv[1]):
        print(f"已補上 archive:{p.name}")
```

- [ ] **Step 4: 確認通過**

Run: `python3 -m pytest tools/share -q`
Expected: 全部 PASS。

- [ ] **Step 5: 實際對 `_posts` 跑一次,並確認可以重跑**

```bash
python3 tools/share/migrate_archive.py _posts
git diff --stat _posts            # 4 個檔各 +1 行
python3 tools/share/migrate_archive.py _posts
git diff --stat _posts            # 跟上一次一樣,沒有新的改動
```

- [ ] **Step 6: Commit**

```bash
git add tools/share/migrate_archive.py tools/share/test_migrate_archive.py _posts
git commit -m "feat(share): 既有 share 補上 archive 欄位的一次性遷移

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: linkcheck 工具與每週排程

**Files:**
- Create: `tools/linkcheck/linkcheck.py`、`tools/linkcheck/test_linkcheck.py`、`.github/workflows/linkcheck.yml`

**Interfaces:**
- Produces:
  - `_data/linkcheck.json`:`{"<issue>": {"strikes": int, "dead": bool}}`,**只記錄 strikes > 0 的 post**(正常的不出現,所以沒變化時檔案不變)
  - `linkcheck.check(url, opener=...) -> "ok" | "dead" | "unknown"`
  - `linkcheck.step(entry: dict | None, result: str) -> dict | None`
  - `linkcheck.run(posts_dir, state_path, check=check) -> bool`(有改動回 True)
  - Task 3 的 `share-card.html` 讀 `site.data.linkcheck[issue].dead`

- [ ] **Step 1: 寫失敗的測試** `tools/linkcheck/test_linkcheck.py`

```python
import json
import socket
import urllib.error

import pytest

import linkcheck


def http_error(code):
    def opener(req, timeout):
        raise urllib.error.HTTPError(req.full_url, code, "x", {}, None)
    return opener


class Ok:
    def __enter__(self): return self
    def __exit__(self, *a): return False


# --- check --------------------------------------------------------------------

def test_check_ok():
    assert linkcheck.check("https://a.com", opener=lambda r, timeout: Ok()) == "ok"


@pytest.mark.parametrize("code", [404, 410])
def test_check_gone_is_dead(code):
    assert linkcheck.check("https://a.com", opener=http_error(code)) == "dead"


@pytest.mark.parametrize("code", [401, 403, 429, 500, 503])
def test_check_blocked_or_server_error_is_unknown(code):
    assert linkcheck.check("https://a.com", opener=http_error(code)) == "unknown"


def test_check_dns_failure_is_dead():
    def opener(req, timeout):
        raise urllib.error.URLError(socket.gaierror(-2, "Name or service not known"))
    assert linkcheck.check("https://gone.example", opener=opener) == "dead"


def test_check_timeout_is_unknown():
    def opener(req, timeout):
        raise urllib.error.URLError(TimeoutError("timed out"))
    assert linkcheck.check("https://a.com", opener=opener) == "unknown"


# --- step ---------------------------------------------------------------------

def test_one_strike_is_not_dead():
    assert linkcheck.step(None, "dead") == {"strikes": 1, "dead": False}


def test_two_strikes_is_dead():
    assert linkcheck.step({"strikes": 1, "dead": False}, "dead") == {"strikes": 2, "dead": True}


def test_ok_clears_entry():
    assert linkcheck.step({"strikes": 3, "dead": True}, "ok") is None


def test_unknown_keeps_entry():
    e = {"strikes": 1, "dead": False}
    assert linkcheck.step(e, "unknown") == e
    assert linkcheck.step(None, "unknown") is None


# --- run ----------------------------------------------------------------------

def post(tmp_path, n, link):
    (tmp_path / f"2026-10-0{n}-share-{n}.md").write_text(
        f'---\ntitle: "t"\nlink: "{link}"\nissue: {n}\n---\n', encoding="utf-8")


def test_run_writes_only_problem_posts(tmp_path):
    post(tmp_path, 1, "https://ok.com")
    post(tmp_path, 2, "https://gone.com")
    state = tmp_path / "linkcheck.json"
    results = {"https://ok.com": "ok", "https://gone.com": "dead"}
    assert linkcheck.run(tmp_path, state, check=results.get) is True
    assert json.loads(state.read_text()) == {"2": {"strikes": 1, "dead": False}}


def test_run_reports_no_change_when_nothing_changed(tmp_path):
    post(tmp_path, 1, "https://ok.com")
    state = tmp_path / "linkcheck.json"
    assert linkcheck.run(tmp_path, state, check=lambda u: "ok") is False
    assert linkcheck.run(tmp_path, state, check=lambda u: "ok") is False


def test_run_drops_entries_for_removed_posts(tmp_path):
    post(tmp_path, 1, "https://ok.com")
    state = tmp_path / "linkcheck.json"
    state.write_text(json.dumps({"9": {"strikes": 2, "dead": True}}))
    assert linkcheck.run(tmp_path, state, check=lambda u: "ok") is True
    assert json.loads(state.read_text()) == {}
```

- [ ] **Step 2: 確認失敗**

Run: `python3 -m pytest tools/linkcheck -q`
Expected: FAIL(`ModuleNotFoundError: No module named 'linkcheck'`)

- [ ] **Step 3: 實作** `tools/linkcheck/linkcheck.py`

```python
"""每週檢查 share 的原文還連不連得到。純 stdlib。

用法: python linkcheck.py <posts_dir> <state_json>
404 / 410 / DNS 失敗算一次 strike,連續兩次才算失效;403 / 429 / 5xx / 逾時不算。
有改動時在 GITHUB_OUTPUT 寫 changed=true。
"""

import json
import os
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path

USER_AGENT = "Mozilla/5.0 (compatible; ShareBot/1.0; +https://randyxu0711.github.io)"
GONE = {404, 410}
DEAD_AFTER = 2


def check(url, opener=urllib.request.urlopen):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with opener(req, timeout=20):
            return "ok"
    except urllib.error.HTTPError as e:
        return "dead" if e.code in GONE else "unknown"
    except urllib.error.URLError as e:
        return "dead" if isinstance(e.reason, socket.gaierror) else "unknown"
    except Exception:  # 其他網路狀況一律當作不確定,不算 strike
        return "unknown"


def step(entry, result):
    if result == "ok":
        return None
    if result == "unknown":
        return entry
    strikes = (entry or {}).get("strikes", 0) + 1
    return {"strikes": strikes, "dead": strikes >= DEAD_AFTER}


def read_posts(posts_dir):
    """回傳 [(issue, link)]。front matter 是 share.py 寫的 `key: <json>` 格式。"""
    out = []
    for path in sorted(Path(posts_dir).glob("*.md")):
        fm = {}
        head = path.read_text(encoding="utf-8").split("\n---\n", 1)[0]
        for line in head.splitlines()[1:]:
            key, sep, value = line.partition(": ")
            if sep and key in ("issue", "link"):
                fm[key] = json.loads(value)
        if "issue" in fm and "link" in fm:
            out.append((str(fm["issue"]), fm["link"]))
    return out


def run(posts_dir, state_path, check=check):
    state_path = Path(state_path)
    old = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    new = {}
    for issue, link in read_posts(posts_dir):
        entry = step(old.get(issue), check(link))
        if entry:
            new[issue] = entry
    changed = new != old
    if changed or not state_path.exists():   # 第一次執行建立空檔,但沒有實質改動就不算 changed
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(new, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                              encoding="utf-8")
    return changed


def main():
    changed = run(sys.argv[1], sys.argv[2])
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
            out.write(f"changed={'true' if changed else 'false'}\n")
    print("changed" if changed else "no change")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 確認通過**

Run: `python3 -m pytest tools/linkcheck -q`
Expected: 全部 PASS。

- [ ] **Step 5: 建立 `.github/workflows/linkcheck.yml`**

```yaml
name: Link check
run-name: "link check"

on:
  schedule:
    - cron: "0 18 * * 0"   # 每週一 02:00(台北)
  workflow_dispatch:

# 跟 share 共用,避免同時 push
concurrency:
  group: share
  cancel-in-progress: false

jobs:
  check:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    outputs:
      changed: ${{ steps.run.outputs.changed }}
    steps:
      - uses: actions/checkout@v7

      - id: run
        run: python3 tools/linkcheck/linkcheck.py _posts _data/linkcheck.json

      - name: Commit
        if: steps.run.outputs.changed == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add _data/linkcheck.json
          git commit -m "linkcheck: 更新失效連結"
          git pull --rebase
          git push

  # GITHUB_TOKEN 的 push 不會觸發 pages-deploy.yml,所以直接呼叫它
  deploy:
    needs: check
    if: needs.check.outputs.changed == 'true'
    permissions:
      contents: read
      pages: write
      id-token: write
    uses: ./.github/workflows/pages-deploy.yml
```

- [ ] **Step 6: 對真實 `_posts` 跑一次(只看輸出,不 commit 產生的檔)**

```bash
python3 tools/linkcheck/linkcheck.py _posts /tmp/lc.json && cat /tmp/lc.json
```

Expected: 印出 `no change` 或 `changed`;4 則都正常時 `/tmp/lc.json` 是 `{}`。

- [ ] **Step 7: Commit**

```bash
git add tools/linkcheck .github/workflows/linkcheck.yml
git commit -m "feat(linkcheck): 每週檢查原文,連續兩週 404/410/DNS 失敗才標成失效

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: books.py(Goodreads CSV → books.json)

**Files:**
- Create: `tools/books/books.py`、`tools/books/test_books.py`、`tools/books/fixtures/goodreads_export.csv`、`tools/books/fixtures/book_page.html`

**Interfaces:**
- Produces:
  - `_data/books.json`:陣列,每本 `{id, title, author, rating, pages, read, added, shelves, url, cover, color, ink}`
    (`ink` = 書脊文字色 `#1c1a17` 或 `#f7f3ea`,`color` 為 null 時也是 null)
  - `_data/book_covers.json`:`{"<id>": {"cover": str|None, "color": str|None}}`(只快取**成功**抓到的)
  - `books.select(rows, hide_shelf) -> list[dict]`、`books.sort_books(list) -> list`
  - `books.extract_cover(html) -> str | None`、`books.dominant_color(data: bytes) -> str`、`books.ink_for(hex) -> str`
  - `books.fill_covers(books, cache, fetch_page, fetch_image, sleep) -> int`(回傳實際抓取次數)

- [ ] **Step 1: 建立 fixture**

`tools/books/fixtures/goodreads_export.csv`(存成 **UTF-8 with BOM、CRLF 換行**;用下面的 Python 產生,不要手打):

```python
# 在 repo 根目錄執行一次,產生 fixture
import csv, io
cols = ["Book Id","Title","Author","Author l-f","Additional Authors","ISBN","ISBN13","My Rating",
        "Average Rating","Publisher","Binding","Number of Pages","Year Published",
        "Original Publication Year","Date Read","Date Added","Bookshelves",
        "Bookshelves with positions","Exclusive Shelf","My Review","Spoiler","Private Notes",
        "Read Count","Owned Copies"]
rows = [
  ["23361794","百年孤寂","加布列.賈西亞.馬奎斯","","","=\"9573331187\"","=\"9789573331186\"","5","4.10","皇冠","Paperback","416","2014","1967","2024/03/02","2024/03/05","latin-american","latin-american (#1)","read","讀完很久都還在想,\"家族\"、輪迴, 還有孤寂。","","秘密筆記 SECRET-NOTE","1","0"],
  ["111","異鄉人","卡繆","","","","","4","","","","","","","","2023/01/10","","","read","","","","1","0"],
  ["222","Hidden Book","Someone","","","","","3","","","","200","","","2022/05/01","2022/05/02","hide, scifi","","read","","","PRIVATE-B","1","0"],
  ["333","想讀的書","某人","","","","","0","","","","100","","","","2025/01/01","","","to-read","","","","0","0"],
  ["444","沒評分的書","某人","","","","","0","","","","","","","","2021/02/02","","","read","","","","1","0"],
  ["555","一九八四","歐威爾","","","","","4","","","","368","","","2024/06/01","2024/06/02","dystopia","","read","","","","1","0"],
]
buf = io.StringIO()
w = csv.writer(buf, lineterminator="\r\n")
w.writerow(cols); w.writerows(rows)
open("tools/books/fixtures/goodreads_export.csv", "w", encoding="utf-8-sig", newline="").write(buf.getvalue())
```

`tools/books/fixtures/book_page.html`:

```html
<!doctype html><html><head>
<meta property="og:title" content="百年孤寂">
<meta property="og:image" content="https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1413222161i/23361794.jpg">
</head><body></body></html>
```

- [ ] **Step 2: 寫失敗的測試** `tools/books/test_books.py`

```python
import json
from pathlib import Path

import pytest

import books

FIX = Path(__file__).parent / "fixtures"


def rows():
    return books.parse_csv((FIX / "goodreads_export.csv").read_bytes())


# --- parse / select -----------------------------------------------------------

def test_parse_csv_handles_bom_crlf_and_quoted_commas():
    r = rows()
    assert r[0]["Book Id"] == "23361794"
    assert r[0]["My Review"].startswith("讀完很久")
    assert '"家族"' in r[0]["My Review"]


def test_select_keeps_only_read_and_not_hidden():
    ids = [b["id"] for b in books.select(rows(), "hide")]
    assert ids == ["23361794", "111", "444", "555"]


def test_select_never_outputs_private_notes_or_review():
    out = json.dumps(books.select(rows(), "hide"), ensure_ascii=False)
    for secret in ("SECRET-NOTE", "PRIVATE-B", "讀完很久"):
        assert secret not in out


def test_select_shapes_fields():
    b = books.select(rows(), "hide")[0]
    assert b == {
        "id": "23361794", "title": "百年孤寂", "author": "加布列.賈西亞.馬奎斯",
        "rating": 5, "pages": 416, "read": "2024-03-02", "added": "2024-03-05",
        "shelves": ["latin-american"], "url": "https://www.goodreads.com/book/show/23361794",
        "cover": None, "color": None, "ink": None,
    }


def test_select_empty_pages_and_dates_become_none():
    b = next(x for x in books.select(rows(), "hide") if x["id"] == "444")
    assert b["pages"] is None and b["read"] is None and b["rating"] == 0


def test_select_hide_shelf_name_is_configurable():
    ids = [b["id"] for b in books.select(rows(), "scifi")]
    assert "222" not in ids


# --- sort ---------------------------------------------------------------------

def test_sort_by_rating_then_read_desc_then_added_desc():
    out = books.sort_books(books.select(rows(), "hide"))
    assert [b["id"] for b in out] == ["23361794", "555", "111", "444"]


# --- covers -------------------------------------------------------------------

def test_extract_cover_reads_og_image():
    html = (FIX / "book_page.html").read_text(encoding="utf-8")
    assert books.extract_cover(html).endswith("/23361794.jpg")


def test_extract_cover_ignores_goodreads_placeholder():
    html = '<meta property="og:image" content="https://s.gr-assets.com/assets/nophoto/book/111x148.png">'
    assert books.extract_cover(html) is None


def test_ink_for_picks_readable_text_color():
    assert books.ink_for("#e8e4dc") == "#1c1a17"
    assert books.ink_for("#2b2b2b") == "#f7f3ea"


def test_dominant_color_of_solid_image():
    PIL = pytest.importorskip("PIL.Image")
    import io
    buf = io.BytesIO()
    PIL.new("RGB", (20, 30), (122, 59, 31)).save(buf, "PNG")
    assert books.dominant_color(buf.getvalue()) == "#7a3b1f"


def test_fill_covers_uses_cache_and_skips_fetching():
    bs = books.select(rows(), "hide")
    cache = {b["id"]: {"cover": "https://c/" + b["id"], "color": "#7a3b1f"} for b in bs}
    n = books.fill_covers(bs, cache, fetch_page=pytest.fail, fetch_image=pytest.fail, sleep=lambda s: None)
    assert n == 0
    assert bs[0]["cover"] == "https://c/23361794" and bs[0]["ink"] == "#f7f3ea"


def test_fill_covers_fetches_missing_and_caches_success():
    bs = [b for b in books.select(rows(), "hide") if b["id"] == "23361794"]
    cache = {}
    html = (FIX / "book_page.html").read_text(encoding="utf-8")
    n = books.fill_covers(bs, cache, fetch_page=lambda i: html,
                          fetch_image=lambda u: b"img", sleep=lambda s: None,
                          color=lambda data: "#123456")
    assert n == 1
    assert cache["23361794"] == {"cover": bs[0]["cover"], "color": "#123456"}


def test_fill_covers_does_not_cache_failures():
    bs = [b for b in books.select(rows(), "hide") if b["id"] == "111"]
    cache = {}

    def boom(i):
        raise OSError("blocked")
    n = books.fill_covers(bs, cache, fetch_page=boom, fetch_image=pytest.fail, sleep=lambda s: None)
    assert n == 1 and cache == {} and bs[0]["cover"] is None


# --- main ---------------------------------------------------------------------

def test_run_writes_both_json_files(tmp_path):
    books.run(FIX / "goodreads_export.csv", tmp_path, hide_shelf="hide",
              fetch_page=lambda i: "", fetch_image=pytest.fail, sleep=lambda s: None)
    data = json.loads((tmp_path / "books.json").read_text(encoding="utf-8"))
    assert [b["id"] for b in data] == ["23361794", "555", "111", "444"]
    assert json.loads((tmp_path / "book_covers.json").read_text(encoding="utf-8")) == {}
```

- [ ] **Step 3: 確認失敗**

Run: `python3 -m pytest tools/books -q`
Expected: FAIL(`ModuleNotFoundError: No module named 'books'`)

- [ ] **Step 4: 實作** `tools/books/books.py`

```python
"""Goodreads 匯出的 CSV → _data/books.json。

用法: python books.py <goodreads_library_export.csv> <data_dir> [hide_shelf]
- 只輸出 read 書架、且不在 hide_shelf 的書。
- 永遠不輸出 Private Notes 與 My Review。
- 封面從 Goodreads 書頁的 og:image 取得,只抓快取裡沒有的;成功的才進快取。
- 主色用 Pillow 算(只有這裡需要 Pillow)。
CSV 本身含私人資料,不要 commit(books/ 在 .gitignore)。
"""

import csv
import io
import json
import sys
import time
import urllib.request
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path

USER_AGENT = "Mozilla/5.0 (compatible; ShareBot/1.0; +https://randyxu0711.github.io)"
BOOK_URL = "https://www.goodreads.com/book/show/{}"
INK_DARK, INK_LIGHT = "#1c1a17", "#f7f3ea"


def parse_csv(data: bytes):
    return list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))


def _date(s):
    try:
        return datetime.strptime(s.strip(), "%Y/%m/%d").date().isoformat()
    except ValueError:
        return None


def _int(s):
    s = (s or "").strip()
    return int(s) if s.isdigit() else None


def select(rows, hide_shelf):
    out = []
    for r in rows:
        shelves = [s.strip() for s in (r.get("Bookshelves") or "").split(",") if s.strip()]
        if (r.get("Exclusive Shelf") or "").strip() != "read" or hide_shelf in shelves:
            continue
        bid = r["Book Id"].strip()
        out.append({
            "id": bid,
            "title": r["Title"].strip(),
            "author": r["Author"].strip(),
            "rating": _int(r.get("My Rating")) or 0,
            "pages": _int(r.get("Number of Pages")),
            "read": _date(r.get("Date Read") or ""),
            "added": _date(r.get("Date Added") or ""),
            "shelves": shelves,
            "url": BOOK_URL.format(bid),
            "cover": None, "color": None, "ink": None,
        })
    return out


def sort_books(items):
    items = sorted(items, key=lambda b: b["added"] or "", reverse=True)
    items = sorted(items, key=lambda b: b["read"] or "", reverse=True)   # 沒有 read 的排在後面
    return sorted(items, key=lambda b: -b["rating"])


class _OgImage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.image = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta" and a.get("property") == "og:image" and self.image is None:
            self.image = (a.get("content") or "").strip() or None


def extract_cover(html):
    p = _OgImage()
    p.feed(html or "")
    if not p.image or "nophoto" in p.image or not p.image.startswith("https://"):
        return None
    return p.image


def dominant_color(data: bytes):
    from PIL import Image  # 只有這裡需要 Pillow
    img = Image.open(io.BytesIO(data)).convert("RGB").resize((1, 1), Image.Resampling.BOX)
    r, g, b = img.getpixel((0, 0))
    return f"#{r:02x}{g:02x}{b:02x}"


def ink_for(hex_color):
    n = int(hex_color[1:], 16)
    r, g, b = n >> 16 & 255, n >> 8 & 255, n & 255
    return INK_DARK if (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 else INK_LIGHT


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read(3_000_000)


def fetch_page(book_id):
    return _get(BOOK_URL.format(book_id)).decode("utf-8", errors="replace")


def fetch_image(url):
    return _get(url)


def fill_covers(items, cache, fetch_page=fetch_page, fetch_image=fetch_image,
                sleep=time.sleep, color=dominant_color):
    fetched = 0
    for b in items:
        hit = cache.get(b["id"])
        if hit is None:
            fetched += 1
            try:
                cover = extract_cover(fetch_page(b["id"]))
                hit = {"cover": cover, "color": color(fetch_image(cover)) if cover else None}
                if cover:
                    cache[b["id"]] = hit
            except Exception as e:  # 抓不到就先不放封面,下次再試
                print(f"{b['id']} {b['title']}:抓不到封面({e})")
                hit = None
            sleep(1)   # 對 Goodreads 客氣一點
        if hit:
            b["cover"], b["color"] = hit["cover"], hit["color"]
            b["ink"] = ink_for(hit["color"]) if hit["color"] else None
    return fetched


def run(csv_path, data_dir, hide_shelf="hide", **fetchers):
    data_dir = Path(data_dir)
    items = sort_books(select(parse_csv(Path(csv_path).read_bytes()), hide_shelf))
    cache_path = data_dir / "book_covers.json"
    cache = json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    fetched = fill_covers(items, cache, **fetchers)
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "books.json").write_text(
        json.dumps(items, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    cache_path.write_text(
        json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"{len(items)} 本書,抓了 {fetched} 本的封面")


if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2], *(sys.argv[3:4]))
```

- [ ] **Step 5: 確認通過**

Run: `python3 -m pytest tools/books -q`
Expected: 全部 PASS(本機沒 Pillow 時 `test_dominant_color_of_solid_image` 顯示 SKIPPED,CI 會跑)。

- [ ] **Step 6: Commit**

```bash
git add tools/books
git commit -m "feat(books): Goodreads CSV 轉成書單資料,永不輸出私人筆記

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: archive 模組的卡片標示

**Files:**
- Modify: `_includes/modules/archive/card-meta.html`、`assets/modules/archive/archive.css`

**Interfaces:**
- Consumes: Task 3 已依 `site.data.linkcheck` 換好 href 並加 `is-dead`;Task 8 的 `linkcheck.json` 格式

- [ ] **Step 1: `_includes/modules/archive/card-meta.html`**

```liquid
{%- capture lc_key -%}{{ include.post.issue }}{%- endcapture -%}
{%- if site.data.linkcheck[lc_key].dead and include.post.archive -%}
<span class="archive-mark">,原文已下架,這是封存版</span>
{%- endif -%}
```

- [ ] **Step 2: `assets/modules/archive/archive.css`**

```css
/* 原文失效、改連封存版的卡片 */
.archive-mark { color: var(--accent); }
.share-card.is-dead .share-title { text-decoration: line-through; text-decoration-color: var(--ink-2); text-decoration-thickness: 1px; }
```

- [ ] **Step 3: 用暫時資料驗證**

```bash
echo '{"1": {"strikes": 2, "dead": true}}' > _data/linkcheck.json
```

Run: `JEKYLL_BUILD`
Expected: 成功,且:

```bash
grep -c 'archive-mark' _site/index.html     # 1
grep -o 'href="https://web.archive.org/web/[^"]*"' _site/index.html | head -1   # issue 1 那則改連封存版
rm _data/linkcheck.json
```

(需要 Task 7 已補上 `archive`;若這條線比 Task 7 先做,先在 issue 1 的 post 手動加 `archive:` 一行,驗證完還原。)

- [ ] **Step 4: Commit**

```bash
git add _includes/modules/archive assets/modules/archive
git commit -m "feat(archive): 原文失效時卡片標示並改連封存版

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 書單頁

**Files:**
- Create: `books.md`、`_layouts/books.html`、`_includes/book-spine.html`、`_includes/book-cover.html`、`_includes/book-dialog.html`、`_plugins/books-page.rb`、`tools/books/run.sh`
- Modify: `assets/modules/books/books.js`、`assets/modules/books/books.css`

**Interfaces:**
- Consumes: Task 9 的 `_data/books.json` 欄位;Task 2 的 `.gel` `.well` `.seg`
- Produces: `localStorage['books-view']` = `spines` / `covers`

- [ ] **Step 1: `_plugins/books-page.rb`**

```ruby
# 書單是空的、或 books 模組關掉時,不產生 /books/
Jekyll::Hooks.register :site, :post_read do |site|
  enabled = (site.config["modules"] || {}).key?("books")
  books = site.data["books"]
  next if enabled && books.is_a?(Array) && !books.empty?
  site.pages.reject! { |p| p.url == "/books/" }
end
```

- [ ] **Step 2: `books.md`**

```markdown
---
layout: books
title: 書架
permalink: /books/
---
```

- [ ] **Step 3: `_includes/book-spine.html` 與 `_includes/book-cover.html`**

`_includes/book-spine.html`(參數 `book`、`row`、`index`):

```liquid
{%- assign b = include.book -%}
{%- assign w = 28 -%}
{%- if b.pages -%}{%- assign w = b.pages | divided_by: 26 | plus: 18 | at_least: 24 | at_most: 58 -%}{%- endif -%}
{%- assign h = b.id | plus: 0 | modulo: 14 | plus: 84 -%}
<div class="slot">
  <button type="button" class="spine" data-row="{{ include.row }}" data-index="{{ include.index }}"
          style="--w: {{ w }}px; --ht: {{ h }}%;{% if b.color %} --col: {{ b.color }}; --spine-ink: {{ b.ink }};{% endif %}"
          aria-label="{{ b.title | escape }},{{ b.author | escape }}">
    <span class="ti">{{ b.title | escape }}</span><span class="au">{{ b.author | escape }}</span>
  </button>
</div>
```

`_includes/book-cover.html`(參數同上):

```liquid
{%- assign b = include.book -%}
<button type="button" class="gel cover-card" data-row="{{ include.row }}" data-index="{{ include.index }}"
        {%- if b.cover %} style="--img: url('{{ b.cover | replace: "'", "%27" | escape }}');{% if b.color %} --col: {{ b.color }}; --spine-ink: {{ b.ink }};{% endif %}"{% endif %}>
  <span class="well">
    <span class="cover">
      {%- if b.cover %}<img src="{{ b.cover | escape }}" alt="" loading="lazy" decoding="async" onerror="this.remove()">{% endif -%}
      <span class="cover-fallback"><span class="ti">{{ b.title | escape }}</span><span class="au">{{ b.author | escape }}</span></span>
    </span>
    <span class="meta"><b>{{ b.title | escape }}</b><span>{{ b.author | escape }}</span></span>
  </span>
</button>
```

- [ ] **Step 4: `_includes/book-dialog.html`**

```liquid
<dialog class="book" id="book" aria-label="書">
  <div class="book-stage" id="book-stage">
    <div class="gel book-card">
      <div class="well">
        <div class="cover" id="b-cover">
          <img id="b-img" alt="" hidden>
          <span class="cover-fallback"><span class="ti" id="b-cti"></span><span class="au" id="b-cau"></span></span>
        </div>
        <div class="book-info">
          <h2 id="b-title"></h2>
          <div class="by" id="b-author"></div>
          <div class="stars" id="b-stars"></div>
          <div class="facts" id="b-pages"></div>
          <a class="gr" id="b-gr" href="https://www.goodreads.com/" target="_blank" rel="noopener">在 Goodreads 查看</a>
        </div>
      </div>
    </div>
    <button type="button" class="navbtn closebtn" id="b-close" aria-label="闔上">×</button>
  </div>
  <div class="book-nav">
    <button type="button" class="navbtn" id="b-prev" aria-label="上一本">‹</button>
    <span class="pos" id="b-pos"></span>
    <button type="button" class="navbtn" id="b-next" aria-label="下一本">›</button>
  </div>
</dialog>
```

- [ ] **Step 5: `_layouts/books.html`**

```liquid
---
layout: default
---
{%- assign ratings = "5,4,3,2,1,0" | split: "," -%}
<section class="books" id="books" data-view="{{ site.books.default_view | default: 'spines' }}">
  <header class="books-head">
    <h1 class="page-title">{{ page.title }}</h1>
    <div class="seg" role="group" aria-label="排法" data-view-switch hidden>
      <button type="button" data-view-set="spines" aria-pressed="false">書脊</button>
      <button type="button" data-view-set="covers" aria-pressed="false">封面</button>
    </div>
  </header>
  {%- for r in ratings -%}
    {%- assign rn = r | plus: 0 -%}
    {%- assign list = site.data.books | where: "rating", r -%}
    {%- if list.size == 0 -%}{%- continue -%}{%- endif -%}
  <section class="book-row" data-row="{{ r }}">
    <h2 class="row-head">
      {%- if rn == 0 -%}<span class="stars-label">未評分</span>
      {%- else -%}<span class="stars" aria-label="{{ rn }} 顆星">{% for i in (1..rn) %}★{% endfor %}</span>{%- endif -%}
      <span class="n">{{ list.size }} 本</span>
    </h2>
    <div class="gel case view-spines"><div class="well">
      {%- for b in list -%}{% include book-spine.html book=b row=r index=forloop.index0 %}{%- endfor -%}
    </div></div>
    <div class="covers view-covers">
      {%- for b in list -%}{% include book-cover.html book=b row=r index=forloop.index0 %}{%- endfor -%}
    </div>
  </section>
  {%- endfor -%}
</section>
{% include book-dialog.html %}
<script type="application/json" id="books-data">{{ site.data.books | jsonify | replace: "</", "<\/" }}</script>
```

- [ ] **Step 6: `assets/modules/books/books.css`**

把 `docs/redesign/mockups/bookshelf.html` 裡 `/* ── 書架原型` 之後到 `.hint {` 之前的規則搬過來,做以下修改:

1. `.case .well` 改用 `.case > .well`;`.spine` 的 `writing-mode` 下一行改成 `text-orientation: mixed;`(Review Focus 5:拉丁字母橫躺)。
2. `.spine` 沒有 `--col` 時的預設:在 `.spine` 規則最前面加 `--col: oklch(0.55 0.09 var(--h)); --spine-ink: #f7f3ea;`。
3. 封面:`.cover` 改成相對定位容器,`.cover img` 絕對定位鋪滿(`position:absolute; inset:0; width:100%; height:100%; object-fit:cover;`),`.cover-fallback` 是原本 `.cover` 的書名排版;有圖時圖蓋住備用封面,圖載入失敗被移除就露出備用封面。
4. 拿掉 `.doc`、`.intro`、`.cmp` 這些設計稿專用規則。
5. 最後加上排法切換:

```css
.books[data-view="spines"] .view-covers,
.books[data-view="covers"] .view-spines { display: none; }
.books-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
.books-head .page-title { margin: 0; }
.book-row { display: grid; gap: 0.75rem; margin-bottom: 2.25rem; }
.row-head { display: flex; align-items: baseline; gap: 0.75rem; margin: 0; font-size: var(--t-lg); }
.row-head .stars { color: var(--accent); letter-spacing: 0.08em; }
.row-head .stars-label { font-size: var(--t-md); }
.row-head .n { color: var(--ink-2); font-size: var(--t-sm); font-weight: 400; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 7: `assets/modules/books/books.js`**

```js
// 書單:排法切換(記在 localStorage)、翻開的書(dialog,可滑、方向鍵、按鈕)。
(function () {
  var root = document.getElementById('books');
  if (!root) return;
  var data = JSON.parse(document.getElementById('books-data').textContent);
  var rows = {};
  data.forEach(function (b) { var k = String(b.rating); (rows[k] = rows[k] || []).push(b); });

  // 排法切換
  var KEY = 'books-view';
  var sw = root.querySelector('[data-view-switch]');
  var btns = sw.querySelectorAll('[data-view-set]');
  function setView(v, remember) {
    root.setAttribute('data-view', v);
    btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-view-set') === v)); });
    if (remember) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  }
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  setView(saved === 'spines' || saved === 'covers' ? saved : root.getAttribute('data-view'), false);
  btns.forEach(function (b) { b.addEventListener('click', function () { setView(b.getAttribute('data-view-set'), true); }); });
  sw.hidden = false;

  // 翻開的書
  var dlg = document.getElementById('book'), stage = document.getElementById('book-stage');
  var $ = function (id) { return document.getElementById(id); };
  var cur = null, idx = 0, opener = null;
  function stars(n) { return n ? '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n) : '未評分'; }
  function fill(dir) {
    var b = cur[idx];
    var card = stage.querySelector('.book-card');
    card.style.setProperty('--img', b.cover ? "url('" + b.cover.replace(/'/g, '%27') + "')" : 'none');
    var cover = $('b-cover');
    if (b.color) { cover.style.setProperty('--col', b.color); cover.style.setProperty('--spine-ink', b.ink); }
    else { cover.style.removeProperty('--col'); cover.style.removeProperty('--spine-ink'); }
    var img = $('b-img');
    img.hidden = !b.cover;
    img.onerror = function () { img.hidden = true; };
    if (b.cover) img.src = b.cover; else img.removeAttribute('src');
    $('b-cti').textContent = b.title; $('b-cau').textContent = b.author;
    $('b-title').textContent = b.title; $('b-author').textContent = b.author;
    var s = $('b-stars'); s.textContent = stars(b.rating);
    s.setAttribute('aria-label', b.rating ? '5 顆星中的 ' + b.rating + ' 顆' : '未評分');
    $('b-pages').textContent = b.pages ? b.pages + ' 頁' : '';
    $('b-gr').href = b.url;
    $('b-pos').textContent = (idx + 1) + ' / ' + cur.length;
    $('b-prev').disabled = idx === 0;
    $('b-next').disabled = idx === cur.length - 1;
    stage.classList.remove('in-l', 'in-r', 'open'); void stage.offsetWidth; stage.classList.add(dir);
  }
  function go(d) { var n = idx + d; if (!cur || n < 0 || n >= cur.length) return; idx = n; fill(d > 0 ? 'in-r' : 'in-l'); }
  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-row][data-index]');
    if (!t) return;
    opener = t; cur = rows[t.getAttribute('data-row')]; idx = +t.getAttribute('data-index');
    fill('open'); dlg.showModal();
  });
  $('b-prev').addEventListener('click', function () { go(-1); });
  $('b-next').addEventListener('click', function () { go(1); });
  $('b-close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('close', function () { if (opener) opener.focus(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { go(1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); }
  });
  var sx = null;
  stage.addEventListener('pointerdown', function (e) { sx = e.clientX; });
  stage.addEventListener('pointerup', function (e) {
    if (sx === null) return; var dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  });
})();
```

注意:`book-row` 的 `data-row` 也會被 `closest('[data-row][data-index]')` 略過(它沒有 `data-index`),只有書脊與封面卡會觸發。

- [ ] **Step 8: `tools/books/run.sh`(本機更新書單用)**

```bash
#!/usr/bin/env bash
# 更新書單:從 Goodreads 匯出 CSV 後執行。CSV 含私人資料,只放在 books/(已 gitignore)。
# 用法: bash tools/books/run.sh [CSV 路徑,預設 books/goodreads_library_export.csv]
set -euo pipefail
csv="${1:-books/goodreads_library_export.csv}"
dir="$(cd "$(dirname "$csv")" && pwd)"
docker run --rm -v "$PWD":/w -v "$dir":/in:ro -w /w python:3.12-slim bash -c \
  "pip install -q pillow && python tools/books/books.py /in/$(basename "$csv") _data"
git status --short _data/books.json _data/book_covers.json
```

- [ ] **Step 9: 用 fixture 驗證**

```bash
mkdir -p books && cp tools/books/fixtures/goodreads_export.csv books/goodreads_library_export.csv
bash tools/books/run.sh
```

Expected: 印出「4 本書,抓了 4 本的封面」。fixture 裡除了百年孤寂,其他 id 是隨便填的,抓到的會是 Goodreads 上其他書的封面或抓不到,只用來驗證流程。

Run: `JEKYLL_BUILD`,Expected: 成功,且:

```bash
test -f _site/books/index.html && echo "書單頁有產生"
grep -c 'class="spine"' _site/books/index.html   # 4
grep -c 'SECRET-NOTE\|PRIVATE-B' _site/books/index.html _data/books.json   # 都是 0
```

再驗證空書單:

```bash
echo '[]' > _data/books.json
```

`JEKYLL_BUILD` 後 `test ! -e _site/books && echo OK`,且導覽列沒有「書架」。

預覽手動檢查(Review Focus 5):書脊牆與封面牆可切換、重新整理後記得;中文書名直排、`Hidden Book` 這類拉丁書名橫躺且不撐破;點書翻開、左右滑 / 方向鍵 / ‹ › 翻頁、第一本時 ‹ 停用;Esc、點背景、× 都能闔上,焦點回到原本那本;晝夜各看一次。

最後清掉測試資料(**不要 commit fixture 產生的 books.json**):

```bash
rm -f _data/books.json _data/book_covers.json books/goodreads_library_export.csv
```

- [ ] **Step 10: Commit**

```bash
git add books.md _layouts/books.html _includes/book-*.html _plugins/books-page.rb tools/books/run.sh assets/modules/books
git commit -m "feat(books): 書單頁,書脊牆與封面牆兩種排法、翻開的書可左右滑

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: About 與 projects 資料化

**Files:**
- Create: `_data/projects.yml`、`_includes/project-card.html`
- Modify: `_tabs/about.md`、`assets/css/site.css`(append)

**Interfaces:**
- Consumes: `.gel` `.well` `.tag`(Task 2)、`.share-body` `.share-title` `.share-desc` 樣式(Task 3)
- Produces: `_data/projects.yml` 格式 `{name, repo, summary: {zh, en}, highlights: {zh: [], en: []}, stack: []}`

- [ ] **Step 1: `_data/projects.yml`**

內容從現在的 `_tabs/about.md` 兩張卡片(中、英各一份)逐字搬過來:

```yaml
- name: hyenovel
  repo: randyxu0711/hyenovel
  summary:
    zh: 文學小說與創作,對很多人來說不容易找到人分享或對談。於是我做了 hyenovel,讓 AI 對文字給出回饋,為創作者提供另一個角度,留一點反思其他可能性的空間。
    en: Literary fiction and creative writing aren't easy to share or talk through with others. hyenovel lets an AI respond to your text, giving writers another angle and some room to reconsider other possibilities.
  highlights:
    zh:
      - 「分析」與「評論」由兩個隔離的 agent 負責,判斷互不污染
      - 每條論點都要引用原文,程式逐字比對,找不到出處就擋下
      - 找出串流瓶頸,回應時間從 83 秒降到 20 秒
    en:
      - Analysis and critique run in two isolated agents, so judgment stays independent
      - Every claim must quote the source; code verifies it verbatim and blocks anything it can't find
      - Found a streaming bottleneck and cut response time from 83s to 20s
  stack: [Python, FastAPI, React, TypeScript]

- name: wpSBOOT
  repo: randyxu0711/wpSBOOT
  summary:
    zh: 政大資科張家銘教授實驗室發表於 <i>Bioinformatics</i> 的演化樹分析方法,我負責開發它的網頁伺服器:上傳序列,以四種比對工具產生 Super-MSA。
    en: A phylogenetic method from Prof. Jia-Ming Chang's lab at NCCU, published in <i>Bioinformatics</i>. I build its web server: upload sequences, get a Super-MSA built from four aligners.
  highlights:
    zh:
      - PostgreSQL 工作佇列 + heartbeat,worker 崩潰時工作可被接手
      - Docker Compose 部署,74 個自動化測試,含容器內實跑 4 種比對工具
      - 結果頁記錄工具版本,方便重現
    en:
      - PostgreSQL job queue with heartbeats, so crashed jobs get picked up
      - Docker Compose deployment, 74 automated tests including all 4 aligners run in-container
      - Every result page records tool versions for reproducibility
  stack: [Python, FastAPI, PostgreSQL, Docker]
```

搬完後用 `git diff` 對照舊的 about.md,確認每句都一字不差(`summary` 允許 `<i>` 這種行內 HTML,所以 include 裡不跳脫 summary)。

- [ ] **Step 2: `_includes/project-card.html`**

```liquid
{%- comment -%} project 卡。參數:project、lang(zh / en) {%- endcomment -%}
{%- assign pr = include.project -%}
{%- assign thumb = 'https://opengraph.githubassets.com/1/' | append: pr.repo -%}
<a class="gel project-card" href="https://github.com/{{ pr.repo }}" target="_blank" rel="noopener" style="--img: url('{{ thumb }}')">
  <div class="well">
    <img class="thumb" src="{{ thumb }}" alt="" loading="lazy" decoding="async" onerror="this.remove()">
    <div class="share-body">
      <h3 class="share-title">{{ pr.name }}</h3>
      <p class="share-desc project-summary">{{ pr.summary[include.lang] }}</p>
      <ul class="project-highlights">
        {%- for h in pr.highlights[include.lang] %}<li>{{ h | escape }}</li>{% endfor %}
      </ul>
      <div class="tags">{% for s in pr.stack %}<span class="tag">{{ s | escape }}</span>{% endfor %}</div>
    </div>
  </div>
</a>
```

- [ ] **Step 3: 改 `_tabs/about.md`**

1. 刪掉檔頭的 `<style>` 整段(樣式移到 site.css)與 front matter 裡的 `icon:` 行。
2. 兩個 `<div class="proj-grid" markdown="0">…</div>` 分別換成:

```liquid
<div class="proj-grid" markdown="0">
{%- for pr in site.data.projects %}{% include project-card.html project=pr lang="zh" %}{% endfor %}
</div>
```

英文那份 `lang="en"`。

3. 經歷、技能、學歷等文字段落、中英切換按鈕與檔尾 `<script>` 原封不動。
4. front matter 加 `title: 關於`。

- [ ] **Step 4: `assets/css/site.css` 最後加上**

```css
/* About */
.lang-switch { display: inline-flex; border-radius: 999px; padding: 3px; background: var(--chip); gap: 2px; margin-bottom: 1.5rem; }
.lang-switch button { font: inherit; font-size: var(--t-sm); color: var(--ink-2); background: none; border: 0; border-radius: 999px; padding: 0.15rem 0.9rem; cursor: pointer; }
.lang-switch button[aria-pressed="true"] { background: var(--well); color: var(--ink); box-shadow: 0 1px 2px var(--drop); }
.lang-en, body[data-about-lang="en"] .lang-zh { display: none; }
body[data-about-lang="en"] .lang-en { display: block; }
.proj-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr)); gap: 1.5rem; margin: 1rem 0 2rem; }
.project-card .thumb { display: block; width: 100%; aspect-ratio: 2 / 1; object-fit: cover; }
.project-summary { -webkit-line-clamp: unset; }
.project-highlights { margin: 0; padding-left: 1.1rem; font-size: var(--t-sm); color: var(--ink-2); line-height: 1.7; }
```

- [ ] **Step 5: 建置驗證**

Run: `JEKYLL_BUILD`,Expected: 成功,且:

```bash
grep -c 'class="gel project-card"' _site/about/index.html   # 4(中英各 2)
grep -c '<i>Bioinformatics</i>' _site/about/index.html       # 2
grep -c 'proj-lang\|fa-github' _site/about/index.html        # 0
```

預覽:中 / EN 切換正常、會記住;project 卡片是膠框、GitHub 預覽圖透進框;手機寬一欄。

- [ ] **Step 6: Commit**

```bash
git add _data/projects.yml _includes/project-card.html _tabs/about.md assets/css/site.css
git commit -m "feat(about): projects 改成資料檔,卡片改用膠框樣式

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: CI、文件、整體驗證

**Files:**
- Modify: `.github/workflows/test.yml`、`CLAUDE.md`、`README.md`

- [ ] **Step 1: `test.yml` 改成跑所有工具並裝 Pillow**

```yaml
name: Test

on:
  push:
    paths: [tools/**, .github/ISSUE_TEMPLATE/**, .github/workflows/test.yml]
  pull_request:

jobs:
  pytest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: pip install pytest pillow
      - run: python3 -m pytest tools -q
```

- [ ] **Step 2: 更新 `CLAUDE.md`**

把〈架構〉與〈一則 share〉兩節改寫成新架構:Jekyll 無主題、三層 token(`assets/css/tokens.css` ← `_config.yml` 的 `appearance`)、`.gel` 材質、插槽與模組(`_config.yml` 的 `modules:`、`_includes/modules/<m>/`、`assets/modules/<m>/`)、share 不產生內部頁(`collections.posts.output: false`)、`archive` 欄位與 `_data/linkcheck.json`、書單流程(`bash tools/books/run.sh`,CSV 永不進 repo)。刪掉「升級 Chirpy 時要逐一對照這些覆蓋檔」。〈測試〉改成 `python3 -m pytest tools`。〈之後再說〉換成 SPEC 的清單。

- [ ] **Step 3: 更新 `README.md`**

〈架構〉表格的「主題」列改成「自己寫的 Jekyll 版面(見 `docs/redesign/SPEC.md`)」;新增〈書單〉一節:

```markdown
## 書單

1. Goodreads → My Books → Import and Export → Export Library,下載 CSV。
2. 放到 `books/goodreads_library_export.csv`(`books/` 已 gitignore,CSV 含私人筆記,不要 commit)。
3. 執行 `bash tools/books/run.sh`(需要 Docker),會更新 `_data/books.json` 與 `_data/book_covers.json`。
4. commit 這兩個檔並 push,網站會自動部署。

不想公開的書,在 Goodreads 放進 `hide` 書架。
```

- [ ] **Step 4: 全部驗證(對照 SPEC〈成功條件〉)**

```bash
python3 -m pytest tools -q                       # 全部通過
git diff main -- tools/share/test_share.py | grep '^-[^-]' | wc -l   # 0:既有測試沒被改
grep -c chirpy Gemfile                           # 0
```

`JEKYLL_BUILD` 成功;再逐項手動檢查 SPEC〈成功條件〉第 6 項的清單(桌機 Brave + 手機寬、晝夜各一次),以及:

- 把 `_config.yml` 的 `appearance.hue` 改成 200 建置一次:全站一起變色、沒有殘留琥珀色(書脊顏色來自資料,除外)。改回 72。
- 逐一註解掉 `modules:` 的每一行各建置一次:都成功、頁面不壞。改回來。

- [ ] **Step 5: Commit 並開 PR(不合併)**

```bash
git add .github/workflows/test.yml CLAUDE.md README.md
git commit -m "docs: 更新架構說明與書單流程;CI 測試涵蓋所有工具

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin redesign
gh pr create --base main --head redesign --title "琥珀改版:拿掉 Chirpy,書架首頁、書單、封存備份" --body "$(cat <<'EOF'
實作 docs/redesign/SPEC.md,計畫見 docs/redesign/PLAN.md。

- 拿掉 Chirpy,改成自己寫的 Jekyll 版面(三層 token + 膠框材質 + 模組插槽)
- 首頁改成書架:精選卡 + 格狀、原地篩選、記得開過哪些、鍵盤操作
- 封存備份:share 發布時送存 Wayback,每週檢查原文,失效改連封存版
- 書單頁:Goodreads CSV 本機轉換,書脊牆 / 封面牆

合併前請在 Brave 走一遍 SPEC〈成功條件〉第 6 項。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**合併到 `main` 由 Randy 決定,不要自己合。**
