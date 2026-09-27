---
name: contagest-release-evidence
description: Converts release claims into SHA-bound deterministic evidence and blocks false PASS/production-ready statements.
contractVersion: 2
---

# ContaGest Release Evidence

## Trigger
Every PR intended for main, release candidate, production deployment, migration or signed/mobile artifact.

## Non-trigger
Do not use historical, queued, source-only, build-only or different-SHA evidence as proof for the current candidate.

## Authority
Executed evidence on the exact candidate SHA and project release policy outrank summaries, comments or deployment UI status.

## Source of truth
Candidate/base Git SHAs, workflow/test logs, artifact hashes and deployed source/build identity.

## Graphify probes
May locate release/deploy dependencies but can never establish PASS, deployment identity or runtime correctness.

## Inputs
Branch/head/base SHA, changed domains/risk, required gates, artifact/deployment identity, rollback strategy and residual risks.

## Invariants
Only `PASS|FAIL|BLOCKED|NOT_EXECUTED`; evidence never transfers between SHAs; build/HTTP/Vercel READY/source inspection never substitute for browser/user-flow QA; when deployed `GitHub main SHA == deployment source SHA == /api/health buildCommit`.

## Workflow
Record static/unit/typecheck/build; relevant DB/migration; browser/E2E/visual; AppSec/tenant/accounting; artifact hash; deployment/build SHA; rollback and residual risk separately.

## Negative tests
Stale SHA, missing required gate, queued runner, mismatched deployment/build SHA, irreversible change without rollback and artifact without hash/provenance.

## Stop conditions
Missing P0/P1 evidence, stale test SHA, unknown deployed SHA, unavailable rollback or any attempt to relabel `BLOCKED/NOT_EXECUTED` as PASS.

## Verification
Freshly execute every required command/check for the candidate and inspect full result before a positive claim.

## Output schema
Candidate/base SHA; domain/risk; gate→status/evidence; artifact/deployment identity; rollback; residual risks; release decision.

## References
`AGENTS.md`, routed QA/security/accounting/DB skills and authoritative workflow definitions.
