---
# 頁首就是 Randy Xu,不另外顯示「關於」標題
title: 關於
title_key: nav.about
hide_title: true
wide: true
order: 4
---
<div class="lang-zh" lang="zh-Hant">
<header class="profile">
  <img class="coin" src="{{ '/assets/img/avatar.jpg' | relative_url }}" alt="Randy Xu" width="120" height="120" decoding="async">
  <div>
    <h1>Randy Xu</h1>
    <p class="role">軟體工程師,正在研究 AI agent</p>
    <p class="intro">曾在 Openfind 擔任 Software Engineer,現在大部分時間用 Claude Agent SDK 做自己想用的工具。工作之外,喜歡讀世界經典文學。這裡放我的 projects、讀到值得一看的技術文章,還有讀過的書。</p>
  </div>
</header>
<div class="cv">
  <section class="cv-row">
    <h2>正在研究</h2>
    <div class="content explore">
      <div><strong>怎麼讓 AI agent 可控、可驗證</strong><p>用 Claude Agent SDK 做多 agent 應用,想的是怎麼讓 AI 的每句話都有出處、權限不越界,以及怎麼把 AI 和可測試的程式邏輯分開。</p></div>
      <div><strong>讀開源 agent 框架的原始碼</strong><p>例如 Hermes Agent 的上下文壓縮、技能系統與自主學習機制,也替它寫了自訂技能。</p></div>
    </div>
  </section>
  <section class="cv-row">
    <h2>Projects</h2>
    <div class="content"><div class="proj-grid">
      {%- for pr in site.data.projects %}{% include project-card.html project=pr lang="zh" %}{% endfor %}
    </div></div>
  </section>
  <section class="cv-row">
    <h2>經歷</h2>
    <div class="content">
      <div class="job-head"><strong>Openfind 網擎資訊,Software Engineer</strong><span>2021/10 – 2024/4</span></div>
      <p>參與企業郵件系統 Mail2000 的核心開發:</p>
      <ul><li>把 C 語言的舊核心拆成可重用的模組,並設計 RESTful API,讓新舊兩套網頁介面共用同一個後端</li><li>用 keepalived 搭配腳本,做到主備機自動切換與資料庫自動復原</li><li>串接雙因素登入</li><li>參與開發 Outlook 同步工具</li></ul>
    </div>
  </section>
  <section class="cv-row">
    <h2>技能</h2>
    <div class="content"><dl class="skills"><dt>AI</dt><dd><span class="tag">Claude Agent SDK</span><span class="tag">多 agent 工作流程</span><span class="tag">上下文管理</span><span class="tag">輸出驗證</span></dd><dt>後端 / 全端</dt><dd><span class="tag">Python</span><span class="tag">FastAPI</span><span class="tag">React</span><span class="tag">TypeScript</span><span class="tag">C</span><span class="tag">C#</span><span class="tag">PostgreSQL</span></dd><dt>維運</dt><dd><span class="tag">Linux</span><span class="tag">Docker</span><span class="tag">Shell</span><span class="tag">Perl</span><span class="tag">GitHub Actions</span></dd></dl></div>
  </section>
  <section class="cv-row">
    <h2>學歷</h2>
    <div class="content"><div class="job-head"><strong>國立政治大學 資訊科學系</strong><span>2016 – 2020</span></div></div>
  </section>
</div>
</div>

<div class="lang-en" lang="en">
<header class="profile">
  <img class="coin" src="{{ '/assets/img/avatar.jpg' | relative_url }}" alt="Randy Xu" width="120" height="120" decoding="async">
  <div>
    <h1>Randy Xu</h1>
    <p class="role">Software engineer, currently exploring AI agents</p>
    <p class="intro">I previously worked as a Software Engineer at Openfind. These days I spend most of my time building tools I actually want to use with the Claude Agent SDK. Outside of code, I read a lot of world classic literature. This site holds my projects, technical articles worth your time, and the books I've read.</p>
  </div>
</header>
<div class="cv">
  <section class="cv-row">
    <h2>Currently exploring</h2>
    <div class="content explore">
      <div><strong>Making AI agents controllable and verifiable</strong><p>Building multi-agent apps with the Claude Agent SDK — every claim the AI makes should have a source, permissions should never overreach, and AI output should stay separate from testable program logic.</p></div>
      <div><strong>Reading open-source agent frameworks</strong><p>E.g. context compression, the skill system and self-learning in Hermes Agent, for which I've also written custom skills.</p></div>
    </div>
  </section>
  <section class="cv-row">
    <h2>Projects</h2>
    <div class="content"><div class="proj-grid">
      {%- for pr in site.data.projects %}{% include project-card.html project=pr lang="en" %}{% endfor %}
    </div></div>
  </section>
  <section class="cv-row">
    <h2>Experience</h2>
    <div class="content">
      <div class="job-head"><strong>Openfind, Software Engineer</strong><span>Oct 2021 – Apr 2024</span></div>
      <p>Worked on the core of Mail2000, an enterprise email system:</p>
      <ul><li>Split the legacy C core into reusable modules and designed RESTful APIs, so the old and new web UIs share one backend</li><li>Built automatic failover and database recovery with keepalived and scripts</li><li>Integrated two-factor login</li><li>Contributed to an Outlook sync tool</li></ul>
    </div>
  </section>
  <section class="cv-row">
    <h2>Skills</h2>
    <div class="content"><dl class="skills"><dt>AI</dt><dd><span class="tag">Claude Agent SDK</span><span class="tag">Multi-agent workflows</span><span class="tag">Context management</span><span class="tag">Output verification</span></dd><dt>Backend / full-stack</dt><dd><span class="tag">Python</span><span class="tag">FastAPI</span><span class="tag">React</span><span class="tag">TypeScript</span><span class="tag">C</span><span class="tag">C#</span><span class="tag">PostgreSQL</span></dd><dt>Ops</dt><dd><span class="tag">Linux</span><span class="tag">Docker</span><span class="tag">Shell</span><span class="tag">Perl</span><span class="tag">GitHub Actions</span></dd></dl></div>
  </section>
  <section class="cv-row">
    <h2>Education</h2>
    <div class="content"><div class="job-head"><strong>B.S. in Computer Science, National Chengchi University</strong><span>2016 – 2020</span></div></div>
  </section>
</div>
</div>
