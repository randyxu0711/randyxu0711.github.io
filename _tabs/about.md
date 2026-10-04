---
# the default layout is 'page'
icon: fas fa-info-circle
order: 4
---

Welcome to my space.

歡迎來到我的小站。

## Projects

<style>
  .proj-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; margin: 1rem 0 2rem; }
  .proj-card { display: flex; flex-direction: column; border: 1px solid var(--main-border-color, rgba(128,128,128,.25)); border-radius: .75rem; overflow: hidden; color: inherit !important; text-decoration: none !important; border-bottom-width: 1px !important; transition: transform .15s, box-shadow .15s; }
  .proj-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,.18); }
  .proj-thumb { aspect-ratio: 2 / 1; background: center / cover no-repeat; border-bottom: 1px solid var(--main-border-color, rgba(128,128,128,.25)); }
  .proj-body { padding: .9rem 1rem 1rem; display: flex; flex-direction: column; flex: 1; }
  .proj-body h3 { font-size: 1.15rem; margin: 0 0 .5rem; }
  .proj-body p { font-size: .9rem; line-height: 1.6; margin: 0 0 .4rem; opacity: .8; }
  .proj-body .en { opacity: .6; }
  .proj-lang { margin-top: auto; padding-top: .4rem; font-size: .8rem; opacity: .7; }
  .proj-lang::before { content: ""; display: inline-block; width: .6rem; height: .6rem; border-radius: 50%; background: #3572A5; margin-right: .35rem; }
</style>

<div class="proj-grid">
  <a class="proj-card" href="https://github.com/randyxu0711/hyenovel" target="_blank" rel="noopener">
    <div class="proj-thumb" style="background-image: url(https://opengraph.githubassets.com/1/randyxu0711/hyenovel)"></div>
    <div class="proj-body">
      <h3><i class="fab fa-github"></i> hyenovel</h3>
      <p>純文學短篇的評論/思考討論工具,跑在 Claude Code——會分析、給發展性回饋、能討論、把分析視覺化。</p>
      <p class="en">A discussion partner for literary short fiction, running on Claude Code — analysis, developmental feedback, conversation and visualization.</p>
      <span class="proj-lang">Python</span>
    </div>
  </a>
  <a class="proj-card" href="https://github.com/randyxu0711/wpSBOOT" target="_blank" rel="noopener">
    <div class="proj-thumb" style="background-image: url(https://opengraph.githubassets.com/1/randyxu0711/wpSBOOT)"></div>
    <div class="proj-body">
      <h3><i class="fab fa-github"></i> wpSBOOT</h3>
      <p>建構 Super-MSA 的 web server,用於 Weighted Partial Super Bootstrap(把多序列比對的不確定性納入 bootstrap)。</p>
      <p class="en">A web server for building Super-MSAs for Weighted Partial Super Bootstrap, folding MSA uncertainty into bootstrap support.</p>
      <span class="proj-lang">Python</span>
    </div>
  </a>
</div>
