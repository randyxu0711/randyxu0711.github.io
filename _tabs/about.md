---
# 內容在 _data/profile.yml(projects 在 _data/projects.yml);版面在 _includes/about.html。
# 頁首就是名字,不另外顯示「關於」標題。
title: 關於
title_key: nav.about
hide_title: true
wide: true
order: 4
---
{% include about.html lang="zh" %}
{% include about.html lang="en" %}
