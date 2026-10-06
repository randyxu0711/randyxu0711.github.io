# share 只當資料用,不輸出內部頁,所有列表直接連原文。
# Jekyll 會強制把 posts 的 output 設成 true,_config.yml 的 collections.posts.output 無效,所以在這裡關掉。
Jekyll::Hooks.register :site, :post_read do |site|
  site.posts.metadata["output"] = false
end
