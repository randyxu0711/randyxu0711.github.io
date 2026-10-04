# frozen_string_literal: true

source "https://rubygems.org"

gem "jekyll-theme-chirpy", "7.6.0" # 鎖死:有覆蓋 layout,升級要逐一對照(見 CLAUDE.md)

gem "html-proofer", "~> 5.0", group: :test

platforms :windows, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end

gem "wdm", "~> 0.2.0", :platforms => [:windows]
