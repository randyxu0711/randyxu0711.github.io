# 書單是空的、或 books 模組關掉時,不產生 /books/
# _config.yml 的 exclude: books(放 CSV 的目錄)是前綴比對,連 books.md 與 _layouts/books.html 也排除了,
# 所以這兩個檔在這裡自己讀進來。
Jekyll::Hooks.register :site, :post_read do |site|
  site.pages.reject! { |p| p.url == "/books/" }
  enabled = (site.config["modules"] || {}).key?("books")
  books = site.data["books"]
  next unless enabled && books.is_a?(Array) && !books.empty?
  site.layouts["books"] ||= Jekyll::Layout.new(site, site.in_source_dir(site.config["layouts_dir"]), "books.html")
  site.pages << Jekyll::Page.new(site, site.source, "", "books.md")
end
