---
name: contagest-release-evidence
description: Converts release claims into SHA-bound deterministic evidence and blocks false PASS/production-ready statements.
---

# ContaGest Release Evidence

## Trigger
Every PR intended for main, release candidate, production deployment, migration or signed/mobile artifact.

## Evidence identity
All evidence is tied to the exact head commit. A test from another SHA is historical context, not proof for the candidate. Any commit after a successful gate makes that gate stale unless the gate's scope is provably unaffected and the release policy explicitly allows reuse.

## Required record
- branch/head SHA and base SHA;
- changed domains and risk class;
- unit/static/typecheck/build status;
- DB/migration status when relevant;
- browser/E2E/visual status when relevant;
- AppSec/tenant/accounting/Hípico gates when relevant;
- artifact hash for deploy/APK/export;
- preview/deployment source SHA;
- `/api/health` build SHA for deployed backend;
- rollback command/commit/migration strategy;
- known residual risks.

## Status vocabulary
Only `PASS`, `FAIL`, `BLOCKED`, `NOT_EXECUTED`.
- `PASS`: command/test actually executed on candidate SHA and passed.
- `FAIL`: executed on candidate SHA and failed because an assertion/build/runtime check failed.
- `BLOCKED`: execution could not start or finish because a named dependency/infrastructure prerequisite prevented it.
- `NOT_EXECUTED`: no attempt/evidence.

A build, HTTP 200, Vercel READY or source inspection never substitutes for browser/user-flow QA.

## GitHub Actions classification
Before diagnosing a failed workflow as a code defect, inspect the job payload.

If a job has all of the following:

```text
runner_id = 0
runner_name = ""
steps = []
```

classify the job `BLOCKED` by runner/infrastructure. Do not call it PASS and do not patch product code based on that job alone. A workflow-level `conclusion: failure` can therefore still contain zero code execution.

If steps executed, inspect the failing step/log on the exact candidate SHA before modifying code. Never fix CI from a stale SHA or by hypothesis when current logs are available.

## Hípico evidence
For Control Hípico changes, record the result of the critical `hipico-platform` routing domain and, when applicable, `hipico-tests`, canonical contracts, SOURCE read-only, Agent/Shadow safety, migration/RLS, responsive browser matrix, offline PWA, Android parity and exact-SHA gates. Provider/document/agent evidence never substitutes for financial authority.

## Production identity gate
When deployed: `GitHub main SHA == deployment source SHA == /api/health buildCommit`. A mismatch blocks production sign-off.

## Stop conditions
Missing P0/P1 evidence, stale test SHA, unknown deployed SHA, unavailable rollback for irreversible change, runner-blocked workflows being called PASS/FAIL without executed steps, or any attempt to rewrite `BLOCKED`/`NOT_EXECUTED` as `PASS`.
