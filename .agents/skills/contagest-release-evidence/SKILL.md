---
name: contagest-release-evidence
description: Converts release claims into SHA-bound deterministic evidence and blocks false PASS/production-ready statements.
---

# ContaGest Release Evidence

## Trigger
Every PR intended for main, release candidate, production deployment, migration or signed/mobile artifact.

## Evidence identity
All evidence is tied to the exact head commit. A test from another SHA is historical context, not proof for the candidate.

## Required record
- branch/head SHA and base SHA;
- changed domains and risk class;
- unit/static/typecheck/build status;
- DB/migration status when relevant;
- browser/E2E/visual status when relevant;
- AppSec/tenant/accounting gates when relevant;
- artifact hash for deploy/APK/export;
- preview/deployment source SHA;
- `/api/health` build SHA for deployed backend;
- rollback command/commit/migration strategy;
- known residual risks.

## Status vocabulary
Only `PASS`, `FAIL`, `BLOCKED`, `NOT_EXECUTED`.
- `PASS`: command/test actually executed on candidate SHA and passed.
- `FAIL`: executed and failed.
- `BLOCKED`: could not execute because a named dependency/infrastructure prerequisite prevented it.
- `NOT_EXECUTED`: no attempt/evidence.

A build, HTTP 200, Vercel READY or source inspection never substitutes for browser/user-flow QA.

## Production identity gate
When deployed: `GitHub main SHA == deployment source SHA == /api/health buildCommit`. A mismatch blocks production sign-off.

## Stop conditions
Missing P0/P1 evidence, stale test SHA, unknown deployed SHA, unavailable rollback for irreversible change, or any attempt to rewrite BLOCKED/NOT_EXECUTED as PASS.
