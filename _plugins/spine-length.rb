# 書脊上的書名「有多長」(以字級為單位),給 books.css 依書脊高度算字級:字級 = 可用高度 ÷ 長度。
# 直排時中日韓字直立、佔一個字高;拉丁字母橫躺,約佔 0.58 個字高;空白約 0.3。
# Liquid 分不出中日韓字與拉丁字母,所以用這個 filter:{{ title | spine_length }}
module SpineLength
  def spine_length(input)
    len = input.to_s.each_char.sum do |c|
      if c == " " then 0.3
      elsif c.ord >= 0x2E80 then 1.0   # 中日韓文字、全形標點
      else 0.58
      end
    end
    [len, 1].max.round(1)
  end
end

Liquid::Template.register_filter(SpineLength)
