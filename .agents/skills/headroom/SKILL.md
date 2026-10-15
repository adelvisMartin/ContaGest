---
name: headroom
description: Safely reduce developer-agent context from oversized logs, tool responses and source navigation in ContaGest/Control Hípico.
---
# Headroom · advisory context compression

## Trigger
A long developer-tool response threatens to obscure the issue, or multiple large sources/logs would overload a review. Adapted from `romangalaxys10-spec/headroom-skill` (Apache-2.0), pinned in `agent-skills.lock.json`.

## Workflow
1. Keep raw evidence in its original location. Summarize only the material copied **into the agent conversation**.
2. For build/CI output preserve all error and warning lines, stack traces, test names and assertions, expected/received, full failing command, line/path, job URL and exact SHA.
3. For search/JSON preserve count and filtering method, provenance, outliers and missing/uncertain entries. For source review preserve signatures AND logic relevant to the current risk; open original files when ambiguity remains.
4. Show that a summary is condensed. An empty or invalid parser result is not a successful test. Do not claim savings without a measured baseline.
5. Use no third-party endpoint, daemon, auto-compression hook or binary. Tool output compression must not mutate user data or saved release artifacts.

## Forbidden compression
Never truncate financial/tenant/medical/audit/source-of-truth records, original CI artifacts, failing stack traces, auth/security logs needed for forensics, migrations, WhatsApp message payloads or idempotency/dedupe evidence. Preserve original text and full traceability whenever compression may hide a defect.

## Priority
`AGENTS.md` + mandatory risk/domain skills + exact-SHA evidence outrank this utility. It occupies no v3 domain-skill slot and makes no change to the runtime bot or ERP.
