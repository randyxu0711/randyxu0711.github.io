# Spec:用 issue 加一本書

跟分享文章一樣:在 Goodreads 書頁按書籤小工具 → 開一張填好網址的 issue → Action 抓書的資料、寫進書單、部署、留言、關 issue。
CSV 匯入(`tools/books/run.sh`)仍然是大量匯入的方式;兩邊共用同一份書單。

## 表單 `.github/ISSUE_TEMPLATE/book.yml`(label `book`)

| 欄位(label) | id | 必填 | 說明 |
|---|---|---|---|
| Goodreads 網址 | `url` | 是 | 書頁網址,如 `https://www.goodreads.com/book/show/11438-...`;書籤小工具用 `?url=` 預填 |
| 評分 | `rating` | | 下拉:5、4、3、2、1、未評分;沒選 = 未評分 |
| 中文書名 | `title_zh` | | 台灣譯本書名;填了就寫進 `_data/books_zh.yml` |
| 中文作者 | `author_zh` | | 作者譯名 |

label 要跟 `tools/books/add_book.py` 的 `LABELS` 一字不差(有測試守門)。

## 流程(`.github/workflows/book.yml` → `tools/books/add_book.py`)

- 只處理 owner 開的、帶 `book` label 的 issue;跟 share 共用 `concurrency: share`,避免同時 push。
- **opened / edited**:
  1. 解析表單;網址不是 Goodreads 書頁(抓不出書號)→ 不發布、留言說明、加 `needs-fix`。
  2. 抓 `https://www.goodreads.com/book/show/<id>`,讀頁面的 JSON-LD(`@type: Book`):書名、第一位作者、頁數、封面網址。
     抓不到或沒有 JSON-LD → 不發布、留言、`needs-fix`(編輯 issue 會重跑)。
  3. 有封面就下載算主色(Pillow,跟 `books.py` 同一個函式)。
  4. 寫入:
     - `_data/books_added.json`:issue 加的書,欄位同 `books.json`,多一個 `issue`。同一個 issue 重跑會覆蓋。
     - `_data/books.json`:同步更新(以 Goodreads ID 比對),再依 `sort_books` 排序。
     - `_data/books_zh.yml`:有填中文書名或作者才寫,條目加 `issue: <n>`;沒填就不動既有條目。
  5. commit → 呼叫部署 → 留言列出抓到的資料 → issue 標題改成「書:<書名>」並關閉。
- **closed as not planned**:從 `books_added.json` 移除;`books.json` 只移除帶同一個 `issue` 的條目
  (CSV 也有這本時,CSV 的那筆沒有 `issue`,會留著);`books_zh.yml` 只移除帶同一個 `issue` 的條目。
- **closed as completed**(Action 自己關的):不動作。

## 跟 CSV 的合併規則

`books.py` 產生 `books.json` 時,把 `books_added.json` 合進來:同一個 Goodreads ID,**CSV 的資料優先**;
CSV 沒有的書照樣保留。所以 issue 加的書不會因為重新匯入 CSV 而消失。

## 欄位

issue 加的書:`read` 為 null(表單不問讀完日期),`added` 是 issue 建立的日期,`shelves` 為空。
排序照舊:評分高到低,同評分有讀完日期的在前。

## 不做

不回寫 Goodreads(沒有 API)。不問讀完日期與心得(之後要再加欄位)。

## 測試(`tools/books/test_add_book.py`)

表單解析與 label 守門、網址驗證與書號擷取、JSON-LD 解析(fixture)、書目組裝、
`books_added` / `books.json` / `books_zh.yml` 的新增 / 覆蓋 / 撤下、各事件的狀態與留言、
`books.py` 合併時 CSV 優先且保留 issue 加的書。網路與 GitHub API 本身不測。
