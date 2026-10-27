#import "template.typ": *

#show: resume.with(
  author: "Randy Xu 許淳荏",
  location: "Taipei, Taiwan",
  contacts: (
    "0960-711-677",
    link("mailto:randy970711@gmail.com", "randy970711@gmail.com"),
    link("https://github.com/randyxu0711", "github.com/randyxu0711"),
    link("https://www.linkedin.com/in/randy-xu0711", "linkedin.com/in/randy-xu0711"),
    link("https://randyxu0711.github.io", "randyxu0711.github.io"),
  ),
)

== Summary
AI engineer and full-stack developer. 2.5 years on Mail2000, an enterprise email platform with 10M+ licensed users; since 2024, building LLM agent applications on the Claude Agent SDK that stay verifiable and cost-aware: code-based guardrails, a per-turn cost ledger and a Python / React front end.

== Skills
- *Languages*: Python, TypeScript, JavaScript, C, C\#, Perl, SQL
- *AI / LLM*: Claude Agent SDK, MCP, Multi-agent orchestration, Structured output, Guardrails, Prompt caching
- *Web & Backend*: FastAPI, React, REST API design, three.js / WebGL, Jekyll
- *Databases & Infrastructure*: PostgreSQL, MongoDB, Docker, GitHub Actions, Linux, keepalived (VRRP), Git

== Work Experience

#job(title: "AI Agent Developer", company: "Independent", location: "Remote", dates: "Apr 2024 – Present")

#link("https://github.com/randyxu0711/hyenovel", strong("hyenovel")): LLM critique and discussion app for literary fiction
- *Architecture*: Orchestration layer on the Claude Agent SDK that keeps the LLM between deterministic code: the orchestrator sequences isolated subagents, and pure-Python checks gate every output.
- *Guardrails*: Outputs must pass JSON Schema, verbatim-quote and node-reference gates; failures go back to the same agent with the errors for self-correction. Per-agent tool allowlists, PreToolUse path guards, 12-turn and \$3 caps.
- *Reliability*: Resumable runs via a state machine; re-analysis snapshots prior results so a failed run never leaves a story worse. Transient 5xx errors back off; quota limits fail fast.
- *Memory*: Discussion transcripts are distilled into gated conclusions and recalled in later sessions; idempotent background settling means a session is never billed twice.
- *Cost & latency*: Per-turn token ledger with a 70% prompt-cache hit rate, about \$0.70–0.90 per critique; disabling extended thinking cut reply time by 75% (83.6 s to 20.3 s).
- *Full stack*: FastAPI streams progress over SSE to a React UI that draws the analysis as an intent graph and tension curve. 478 Python and 156 front-end tests, 100% coverage gate on the deterministic layer.

#job(title: "Software Engineer", company: "Openfind", location: "Taipei, Taiwan", dates: "Oct 2021 – Apr 2024")
- *Legacy system modernization*: Refactored 30+ legacy C CGI programs into shared libraries and built a REST API layer on top, so the web UI, mobile app and customer integrations share one backend.
- *Exchange migration*: Owned a C\# Windows client that syncs Outlook mail, contacts and calendars with Mail2000 over MAPI (Redemption library), used by 10,000+ end users at customers migrating off Exchange.
- *Two-factor authentication (2FA)*: Owned the login integration with a partner's authentication API, supporting OTP codes and push-notification approval.
- *High availability*: Owned the failover module, Perl scripts driving keepalived (VRRP), lsyncd file replication and MongoDB replica sets; the standby takes over within \~10 seconds.

== Projects

#proj("randyxu0711.github.io", "randyxu0711/randyxu0711.github.io", "three.js / WebGL, Jekyll, GitHub Actions, Python", "2026")
- Three scenes in three.js, incl. a 270-book shelf in one instanced draw call; plain HTML fallback.
- Serverless CMS on GitHub Actions: opening an issue fetches the page metadata, archives it on the Wayback Machine and deploys; a weekly job points dead links to the archive. 216 tests.

#proj("wpSBOOT", "randyxu0711/wpSBOOT", "Python, FastAPI, PostgreSQL, Docker", "2019, rebuilt 2026")
- Web server for a phylogenetic method published in _Bioinformatics_ (NCCU lab), re-architected in one day with an AI coding agent; PostgreSQL job queue with `SKIP LOCKED` and worker heartbeats. 59 tests.

== Education

*National Chengchi University* | B.S. in Computer Science #h(1fr) 2016 – 2020
