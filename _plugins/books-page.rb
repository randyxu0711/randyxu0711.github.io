# 書單是空的、或 books 模組關掉時,不產生 /books/
Jekyll::Hooks.register :site, :post_read do |site|
  enabled = (site.config["modules"] || {}).key?("books")
  books = site.data["books"]
  next if enabled && books.is_a?(Array) && !books.empty?
  site.pages.reject! { |p| p.url == "/books/" }
end
