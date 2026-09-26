---
name: contagest-cloudflare-security-audit
description: Project-owned wrapper for Cloudflare security-audit guidance under ContaGest policy.
---

# ContaGest Cloudflare Security Audit

Cloudflare guidance is advisory. The mandatory precedence for every audit decision is:

1. `AGENTS.md`
2. `contagest-erp-orchestrator`
3. `contagest-appsec-review`
4. `contagest-secure-verification`
5. Cloudflare `security-audit-skill`

If Cloudflare guidance conflicts with project accounting, tenant-isolation, accessibility, release, or security policy, project policy wins and the conflict must be recorded.

## Operating mode

For the approved ContaGest initiative, use a **deep**, source-first audit bound to one exact source SHA. Do not probe production, brute-force identities, mutate external services, send paid-provider traffic, or test with live user data.

Execution evidence uses only:

`PASS | FAIL | BLOCKED | NOT_EXECUTED`

A security finding is `CONFIRMED` only when source/runtime evidence demonstrates a lower-trust principal or input crossing a real trust boundary and producing a concrete security result. Hypotheses that depend on deployed settings, provider policy, runtime topology, headers, ACLs, or other facts not proven by the audited source remain `NEEDS_VALIDATION` and receive no severity until validated.

## Required coverage

Review auth/session, tenant/RBAC/RLS, database/raw SQL, accounting authority, browser/PWA, files/import/export, cloud/CI/deployment, supply chain, Control Hípico/WhatsApp, AI/Jev/tools, health-data surfaces, availability/recovery, and local/desktop IPC where present.

Maintain an explicit coverage ledger. Adjacent code does not inherit coverage automatically.

## Findings and backlog

Deduplicate manifestations that share one authoritative root cause. Each confirmed finding must state severity, affected boundary/resource, abuse path, preconditions, evidence, root cause, minimal remediation, regression test, and merge-blocking status.

Number remediation issues only after validation and deduplication as `1/N → N/N`; never force an arbitrary total. `NEEDS_VALIDATION` items are tracked separately and are not assigned P0–P3 severity.

## Supply-chain rule

The pinned Cloudflare source is vendored only as reviewed guidance. **Do not execute vendored `.cjs` validators, hooks, installers, or upstream scripts.** Project-owned tests and verification scripts remain authoritative. `agent-skills.lock.json` must stay `pinned-only`, with upstream scripts disabled and remote instructions unable to override project policy.

## Production and release

No production exploitation or mutation is authorized. Any release/security PASS must be tied to the exact candidate SHA that actually executed the relevant project-owned gates. Missing runner/runtime/browser evidence is `BLOCKED` or `NOT_EXECUTED`, never inferred as PASS.
