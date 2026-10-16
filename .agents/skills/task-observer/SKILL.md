---
name: task-observer
description: Review workflow friction and recurring agent mistakes after substantive ticket work; suggest—not apply—improvements.
---
# Task Observer · ContaGest advisory adapter

Inspired by Eoghan Henn and contributors, `rebelytics/one-skill-to-rule-them-all`, CC BY 4.0, pinned in `agent-skills.lock.json`. Attribution retained; this adapter is project-owned and narrower than the upstream skill.

## Trigger and method
During a substantive ticket session, note concrete recurring friction: incorrect scope, user correction, missing regression test, stale handoff, broken workflow, or a frequently repeated manual check. Do not interrupt task implementation or consume the 2–4 mandatory routed domain skills.

At ticket closure or handoff, emit only actionable proposals in the owning PR/issue or isolated local note, with:
`issue | exact candidate SHA | symptom and evidence | root pattern | proposed skill/test/process change | PROPOSED/ACCEPTED/REJECTED`.

## Authority and privacy
A proposal cannot modify skills, `AGENTS.md`, tests, branch protection, GitHub issues, automations or CI without separate source-grounded review. Do not run upstream session hooks, `npx skills add`, background observers or auto-improvement scripts. Never record prompts, secrets, protected metadata, tenant/medical/payment data, WhatsApp messages or personal conversations.

## Parallel workers
No shared mutable global observation log: use per-ticket isolated handoffs, deduplicate in the PR/backlog before creating an improvement ticket. If nothing substantive was observed, record nothing. Preserve author credit and licensing for any derivative content.
