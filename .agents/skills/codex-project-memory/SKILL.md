---
name: codex-project-memory
description: Controlled, reviewable ticket handoffs for Codex/ChatGPT windows across ContaGest and Control Hípico without hidden cross-chat memory.
---
# Codex project memory · ContaGest adapter

## Trigger
Resume a ticket, transfer work among multiple windows, or reconstruct technical decisions and verification evidence.

## Authority and inputs
Read root `AGENTS.md`, ticket/acceptance criteria, live `main` and current PR/exclusive claims first. Source code and tests outrank any memory note. Concept adapted from MIT `richenyu/codex-smart-project-memory`; pinned in `agent-skills.lock.json`. No Claude-Mem worker or automatic hooks are installed.

## Workflow
1. Scope recall to one issue/PR; use `.agents/context/PROJECT_MAP.json` and ticket files only as navigation hints.
2. Read a sanitized branch/PR handoff if present; compare the **recorded candidate SHA** with live HEAD.
3. On the end of material work, put the handoff in the owning PR body/comment or branch-scoped local notes: ticket, goal, ownership, base/head SHA, affected files, design decisions with evidence, commands actually executed, per-gate status, open risk, next safe action.
4. In a different window, independently confirm the issue is still open, review newer PRs and re-run the ticket router before touching any files.
5. Never share writable branches or append-only memory logs among concurrent workers; never use old PASS for a new SHA.

## Non-goals and guardrails
This is structured **project documentation**, not automatic recall of ChatGPT history. Do not store credentials, environment values, user or health records, WhatsApp content, raw telemetry, production database output or hidden prompts. Do not merge, close a ticket, upgrade a gate or invent context from memory alone.

## Verify
Handoff contains issue + exact SHA + provenance + evidence statuses; stale/missing handoff yields `NOT VERIFIED` and forces re-check. No extra domain-skill routing slot.
