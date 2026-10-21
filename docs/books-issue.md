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
| 作者國家 | `country` | | 手填,中文或英文國名都可以,要是 `_data/geo.yml` 的國家(如「英國」或 `United Kingdom`,英文大小寫不拘);第一次讀這位作者時填,已在 `_data/authors.yml` 就不用 |

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
  5. 作者國家(地球儀用,見 `docs/books-map.md`〈新書的國家〉)。先拿掉這個 issue 自己之前寫的 `authors.yml` 條目,再看:
     - 作者(跟 `books.json` 一字不差)已在 `_data/authors.yml`:不動作,留言寫「美國(已在名單)」。
     - 表單有填「作者國家」且對得到 `geo.yml`(英文鍵或中文名):加一筆 `literature` + `basis: "issue #n"` + `issue: n`(留言「(表單)」)。
     - 沒填:書照常發布、照常關 issue,留言寫「沒填」(地圖上不會有這本,要補就編輯 issue)。不查網路。
     - 填了但對不到(打錯或新國家):**書照樣發布**,status 是 `published_needs_fix`:留言說要先在 `geo.yml` 加這一國
       (`zh`、`subregion`、`at`、`qid`)、加 `needs-fix`、issue 留著開;編輯 issue 會重跑。
     - `authors.yml` 以文字處理(Action 只裝 Pillow,沒有 PyYAML):新條目接在檔尾,其他內容一個位元組都不動。
  6. commit(含 `_data/authors.yml`)→ 呼叫部署 → 留言列出抓到的資料與作者國家 → issue 標題改成「書:<書名>」並關閉
     (`published_needs_fix` 不關)。
- **closed as not planned**:從 `books_added.json` 移除;`books.json` 只移除帶同一個 `issue` 的條目
  (CSV 也有這本時,CSV 的那筆沒有 `issue`,會留著);`books_zh.yml`、`authors.yml` 只移除帶同一個 `issue` 的條目。
- **closed as completed**(Action 自己關的):不動作。

## 跟 CSV 的合併規則

`books.py` 產生 `books.json` 時,把 `books_added.json` 合進來:同一個 Goodreads ID,**CSV 的資料優先**;
CSV 沒有的書照樣保留。所以 issue 加的書不會因為重新匯入 CSV 而消失。
轉完列出 `authors.yml` 沒有的作者(不連網查,手動補)。

## 欄位

issue 加的書:`read` 與 `added` 都是 issue 建立的日期(台北時間;通常讀完就加書,差幾天無所謂,CSV 重新匯入時以 Goodreads 為準。
issue 表單沒有日期欄位型別,所以不問),`shelves` 為空。
排序照舊:評分高到低,同評分有讀完日期的在前。

## 不做

不回寫 Goodreads(沒有 API)。不問心得(之後要再加欄位);讀完日期用開 issue 那天。

## 測試(`tools/books/test_add_book.py`)

表單解析與 label 守門、網址驗證與書號擷取、JSON-LD 解析(fixture)、書目組裝、
`books_added` / `books.json` / `books_zh.yml` 的新增 / 覆蓋 / 撤下、各事件的狀態與留言、
`books.py` 合併時 CSV 優先且保留 issue 加的書、列出缺的作者。
作者國家:已在名單不動、表單填英文 / 中文 / 對不到 / 沒填、
`authors.yml` 新增時其他內容一字不差、重跑覆蓋自己的條目、撤下只移除自己的條目、文字解析跟 PyYAML 讀出來一樣。
網路與 GitHub API 本身不測。
