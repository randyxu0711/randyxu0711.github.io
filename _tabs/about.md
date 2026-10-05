---
# the default layout is 'page'
icon: fas fa-info-circle
order: 4
---

<style>
  .lang-switch { display: inline-flex; border: 1px solid var(--main-border-color, rgba(128,128,128,.3)); border-radius: 999px; overflow: hidden; margin-bottom: 1.5rem; }
  .lang-switch button { border: 0; background: none; color: inherit; padding: .25rem .9rem; font-size: .85rem; opacity: .6; }
  .lang-switch button[aria-pressed="true"] { background: var(--main-border-color, rgba(128,128,128,.2)); opacity: 1; }
  .lang-en, body[data-about-lang="en"] .lang-zh { display: none; }
  body[data-about-lang="en"] .lang-en { display: block; }
  .proj-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; margin: 1rem 0 2rem; }
  .proj-card { display: flex; flex-direction: column; border: 1px solid var(--main-border-color, rgba(128,128,128,.25)); border-radius: .75rem; overflow: hidden; color: inherit !important; text-decoration: none !important; border-bottom-width: 1px !important; transition: transform .15s, box-shadow .15s; }
  .proj-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.18); }
  .proj-thumb { aspect-ratio: 2 / 1; background: center / cover no-repeat; border-bottom: 1px solid var(--main-border-color, rgba(128,128,128,.25)); }
  .proj-body { padding: .9rem 1rem 1rem; display: flex; flex-direction: column; flex: 1; }
  .proj-body h3 { font-size: 1.15rem; margin: 0 0 .5rem; }
  .proj-body p { font-size: .9rem; line-height: 1.6; margin: 0 0 .5rem; opacity: .85; }
  .proj-body ul { font-size: .85rem; line-height: 1.55; margin: 0 0 .5rem; padding-left: 1.1rem; opacity: .75; }
  .proj-lang { margin-top: auto; padding-top: .4rem; font-size: .8rem; opacity: .7; }
  .proj-lang::before { content: ""; display: inline-block; width: .6rem; height: .6rem; border-radius: 50%; background: #3572A5; margin-right: .35rem; }
</style>

<div class="lang-switch" role="group" aria-label="Language">
  <button type="button" data-set-lang="zh" aria-pressed="true">中</button>
  <button type="button" data-set-lang="en" aria-pressed="false">EN</button>
</div>

<div class="lang-zh" lang="zh-Hant" markdown="1">

Welcome to my space.

嗨,我是 Randy,軟體工程師。曾在 Openfind 擔任 Software Engineer,現在大部分時間在研究 AI agent,用 Claude Agent SDK 做些自己想用的工具。工作之外,喜歡讀世界經典文學。

這裡放我的 projects,還有我讀到、覺得值得一看的技術文章。

## 最近關注

- **怎麼讓 AI agent 可控、可驗證**:用 Claude Agent SDK 做多 agent 應用,想的是怎麼讓 AI 的每句話都有出處、權限不越界,以及怎麼把 AI 和可測試的程式邏輯分開。
- **讀開源 agent 框架的原始碼**:例如 Hermes Agent 的上下文壓縮、技能系統與自主學習機制,也替它寫了自訂技能。

## Projects

<div class="proj-grid" markdown="0">
  <a class="proj-card" href="https://github.com/randyxu0711/hyenovel" target="_blank" rel="noopener">
    <div class="proj-thumb" style="background-image: url(https://opengraph.githubassets.com/1/randyxu0711/hyenovel)"></div>
    <div class="proj-body">
      <h3><i class="fab fa-github"></i> hyenovel</h3>
      <p>文學小說與創作,對很多人來說不容易找到人分享或對談。於是我做了 hyenovel,讓 AI 對文字給出回饋,為創作者提供另一個角度,留一點反思其他可能性的空間。</p>
      <ul>
        <li>「分析」與「評論」由兩個隔離的 agent 負責,判斷互不污染</li>
        <li>每條論點都要引用原文,程式逐字比對,找不到出處就擋下</li>
        <li>找出串流瓶頸,回應時間從 83 秒降到 20 秒</li>
      </ul>
      <span class="proj-lang">Python · FastAPI · React · TypeScript</span>
    </div>
  </a>
  <a class="proj-card" href="https://github.com/randyxu0711/wpSBOOT" target="_blank" rel="noopener">
    <div class="proj-thumb" style="background-image: url(https://opengraph.githubassets.com/1/randyxu0711/wpSBOOT)"></div>
    <div class="proj-body">
      <h3><i class="fab fa-github"></i> wpSBOOT</h3>
      <p>政大資科張家銘教授實驗室發表於 <i>Bioinformatics</i> 的演化樹分析方法,我負責開發它的網頁伺服器:上傳序列,以四種比對工具產生 Super-MSA。</p>
      <ul>
        <li>PostgreSQL 工作佇列 + heartbeat,worker 崩潰時工作可被接手</li>
        <li>Docker Compose 部署,74 個自動化測試,含容器內實跑 4 種比對工具</li>
        <li>結果頁記錄工具版本,方便重現</li>
      </ul>
      <span class="proj-lang">Python · FastAPI · PostgreSQL · Docker</span>
    </div>
  </a>
</div>

## 經歷

**Openfind 網擎資訊 · Software Engineer**(2021/10 – 2024/4)

參與企業郵件系統 Mail2000 核心開發:把 C 語言舊核心拆成可重用模組並設計 RESTful API,讓新舊介面共用同一套後端;以 keepalived 搭配腳本實作主備自動切換與資料庫自動復原;串接雙因素登入;參與開發 Outlook 同步工具。

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
  <a class="proj-card" href="https://github.com/randyxu0711/hyenovel" target="_blank" rel="noopener">
    <div class="proj-thumb" style="background-image: url(https://opengraph.githubassets.com/1/randyxu0711/hyenovel)"></div>
    <div class="proj-body">
      <h3><i class="fab fa-github"></i> hyenovel</h3>
      <p>Literary fiction and creative writing aren't easy to share or talk through with others. hyenovel lets an AI respond to your text, giving writers another angle and some room to reconsider other possibilities.</p>
      <ul>
        <li>Analysis and critique run in two isolated agents, so judgment stays independent</li>
        <li>Every claim must quote the source; code verifies it verbatim and blocks anything it can't find</li>
        <li>Found a streaming bottleneck and cut response time from 83s to 20s</li>
      </ul>
      <span class="proj-lang">Python · FastAPI · React · TypeScript</span>
    </div>
  </a>
  <a class="proj-card" href="https://github.com/randyxu0711/wpSBOOT" target="_blank" rel="noopener">
    <div class="proj-thumb" style="background-image: url(https://opengraph.githubassets.com/1/randyxu0711/wpSBOOT)"></div>
    <div class="proj-body">
      <h3><i class="fab fa-github"></i> wpSBOOT</h3>
      <p>A phylogenetic method from Prof. Jia-Ming Chang's lab at NCCU, published in <i>Bioinformatics</i>. I build its web server: upload sequences, get a Super-MSA built from four aligners.</p>
      <ul>
        <li>PostgreSQL job queue with heartbeats, so crashed jobs get picked up</li>
        <li>Docker Compose deployment, 74 automated tests including all 4 aligners run in-container</li>
        <li>Every result page records tool versions for reproducibility</li>
      </ul>
      <span class="proj-lang">Python · FastAPI · PostgreSQL · Docker</span>
    </div>
  </a>
</div>

## Experience

**Openfind · Software Engineer** (Oct 2021 – Apr 2024)

Worked on the core of Mail2000, an enterprise email system: split the legacy C core into reusable modules and designed RESTful APIs so old and new web UIs share one backend; built automatic failover and database recovery with keepalived and scripts; integrated two-factor login; contributed to an Outlook sync tool.

## Skills

- **AI**: Claude Agent SDK, multi-agent workflows, context management, output verification
- **Backend / full-stack**: Python, FastAPI, React, TypeScript, C, C#, PostgreSQL
- **Ops**: Linux, Docker, Shell, Perl, GitHub Actions

## Education

B.S. in Computer Science, National Chengchi University (2016 – 2020)

</div>

<script>
  (function () {
    var buttons = document.querySelectorAll('[data-set-lang]');
    function apply(lang) {
      document.body.setAttribute('data-about-lang', lang);
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute('aria-pressed', String(buttons[i].getAttribute('data-set-lang') === lang));
      }
    }
    var saved = null;
    try { saved = localStorage.getItem('about-lang'); } catch (e) {}
    apply(saved || (/^zh/i.test(navigator.language || '') ? 'zh' : 'en'));
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        var lang = this.getAttribute('data-set-lang');
        apply(lang);
        try { localStorage.setItem('about-lang', lang); } catch (e) {}
      });
    }
  })();
</script>
