Jekyll::Hooks.register :site, :post_read do |site|
  authors = site.data["authors"] || {}
  geo = site.data["geo"] || {}
  books = site.data["books"]
  books = [] unless books.is_a?(Array)

  resolved = {}
  books.each do |b|
    name = b["author"]
    next if resolved.key?(name)
    a = authors[name]
    a = authors[a["counts_as"]] if a && a["counts_as"]
    resolved[name] = { "g" => a && a["literature"], "go" => a && a["origin"] }
  end

  countries = {}
  (geo["countries"] || {}).each do |key, c|
    next unless resolved.values.any? { |r| r["g"] == key }
    countries[key] = { "zh" => c["zh"], "en" => key, "at" => c["at"], "topo" => c["topo"] || key, "subregion" => c["subregion"] }
  end
  subs = countries.values.map { |c| c["subregion"] }.uniq
  subregions = (geo["subregions"] || {}).select { |id, _| subs.include?(id) }
  conts = subregions.values.map { |s| s["continent"] }.uniq

  site.data["book_geo"] = resolved
  site.data["books_geo"] = {
    "continents" => (geo["continents"] || {}).select { |id, _| conts.include?(id) }.map { |id, c| { "id" => id, "zh" => c["zh"], "en" => c["en"] } },
    "subregions" => subregions.map { |id, s| { "id" => id, "zh" => s["zh"], "en" => s["en"], "continent" => s["continent"] } },
    "countries" => countries,
  }
end
