---
# the default layout is 'page'
title: 關於
title_key: nav.about
order: 4
---

<figure class="gel about-banner" style="--img: url('{{ '/assets/img/about-banner.jpg' | relative_url }}')">
  <div class="well"><img src="{{ '/assets/img/about-banner.jpg' | relative_url }}" alt="Randy Xu" width="1200" height="450" decoding="async"></div>
</figure>

<div class="lang-zh" lang="zh-Hant" markdown="1">

Welcome to my space.

嗨,我是 Randy,軟體工程師。曾在 Openfind 擔任 Software Engineer,現在大部分時間在研究 AI agent,用 Claude Agent SDK 做些自己想用的工具。工作之外,喜歡讀世界經典文學。

這裡放我的 projects,還有我讀到、覺得值得一看的技術文章。

## 最近關注

- **怎麼讓 AI agent 可控、可驗證**:用 Claude Agent SDK 做多 agent 應用,想的是怎麼讓 AI 的每句話都有出處、權限不越界,以及怎麼把 AI 和可測試的程式邏輯分開。
- **讀開源 agent 框架的原始碼**:例如 Hermes Agent 的上下文壓縮、技能系統與自主學習機制,也替它寫了自訂技能。

## Projects

<div class="proj-grid" markdown="0">
{%- for pr in site.data.projects %}{% include project-card.html project=pr lang="zh" %}{% endfor %}
</div>

## 經歷

**Openfind 網擎資訊**,Software Engineer(2021/10 – 2024/4)

參與企業郵件系統 Mail2000 的核心開發:

- 把 C 語言的舊核心拆成可重用的模組,並設計 RESTful API,讓新舊兩套網頁介面共用同一個後端
- 用 keepalived 搭配腳本,做到主備機自動切換與資料庫自動復原
- 串接雙因素登入
- 參與開發 Outlook 同步工具

## 技能

- **AI**:Claude Agent SDK、多 agent 工作流程、上下文管理、輸出驗證
- **後端/全端**:Python、FastAPI、React、TypeScript、C、C#、PostgreSQL
- **維運**:Linux、Docker、Shell、Perl、GitHub Actions

## 學歷

國立政治大學 資訊科學系(2016 – 2020)

</div>

<div class="lang-en" lang="en" markdown="1">

Welcome to my space.

Hi, I'm Randy, a software engineer. I previously worked as a Software Engineer at Openfind; these days I spend most of my time on AI agents, building tools I actually want to use with the Claude Agent SDK. Outside of code, I read a lot of world classic literature.

This site holds my projects, plus technical articles I've read and think are worth your time.

## Currently Exploring

- **Making AI agents controllable and verifiable**: building multi-agent apps with the Claude Agent SDK — every claim the AI makes should have a source, permissions should never overreach, and AI output should stay separate from testable program logic.
- **Reading open-source agent frameworks**: e.g. context compression, the skill system and self-learning in Hermes Agent, for which I've also written custom skills.

## Projects

<div class="proj-grid" markdown="0">
{%- for pr in site.data.projects %}{% include project-card.html project=pr lang="en" %}{% endfor %}
</div>

## Experience

**Openfind**, Software Engineer (Oct 2021 – Apr 2024)

Worked on the core of Mail2000, an enterprise email system:

- Split the legacy C core into reusable modules and designed RESTful APIs, so the old and new web UIs share one backend
- Built automatic failover and database recovery with keepalived and scripts
- Integrated two-factor login
- Contributed to an Outlook sync tool

## Skills

- **AI**: Claude Agent SDK, multi-agent workflows, context management, output verification
- **Backend / full-stack**: Python, FastAPI, React, TypeScript, C, C#, PostgreSQL
- **Ops**: Linux, Docker, Shell, Perl, GitHub Actions

## Education

B.S. in Computer Science, National Chengchi University (2016 – 2020)

</div>
