# #668 Zero-Cost Reproducible Bootstrap — Design

## Status

Design approved in chat on 2026-09-29. This document captures the architecture before implementation, per project engineering rules.

## Objective

Guarantee that ContaGest can be developed, tested and verified with **mandatory infrastructure cost USD 0** while the product is not generating revenue. Supabase, Vercel, GitHub Actions or any other external provider may be optional conveniences, but no required local development, QA or database gate may depend on a paid plan.

## Current implementation baseline

- Repository: `adelvisMartin/ContaGest`
- Branch authority: `main`
- Implementation baseline SHA: `b123a6f6b34eb3bcb4a38978b69842f5af6be9de`
- Existing authorities to consume, not replace:
  - #630 local verification profiles
  - #632 canonical database gate
  - #626 migration-chain verification
  - #637 financial domain/posting authority
  - #643 golden financial dataset
  - #624 backlog/provider-blocker tracking

## Non-negotiable constraints

1. Mandatory infrastructure cost is USD 0.
2. PostgreSQL 17 is the portable database authority for destructive local/QA verification.
3. Supabase SaaS remains an optional target/adaptor, never a prerequisite for the canonical gate.
4. Windows + PowerShell + VS Code is a first-class developer path; WSL is not required.
5. No destructive operation may run against production or a remote/provider database.
6. No production PII, credentials or copied production fixtures.
7. No silent installation of system software.
8. No skip/only/force/waitForTimeout or artificial timeout inflation to fabricate green.
9. Exact candidate SHA is part of verification evidence; changing SHA invalidates prior material evidence.
10. Cleanup must run on success, failure and interruption as far as the runtime permits.

## Architecture

A single zero-cost bootstrap entrypoint prepares a safe local runtime and delegates actual verification to existing authorities.

```text
clean checkout/worktree
  -> prerequisites detection
  -> package-manager/lockfile validation
  -> environment safety validation
  -> choose PostgreSQL 17 runtime
       A. existing loopback PG17
       B. ephemeral postgres:17 container via Docker/Podman
       C. explicit BLOCKED with actionable diagnosis
  -> expose LOCAL_VERIFY_DATABASE_ADMIN_URL
  -> #630 database profile -> #632 canonical database gate
  -> #630 financial profile when requested/applicable
  -> optional local backend/frontend smoke
  -> sanitized exact-SHA evidence
  -> guaranteed cleanup
```

Runtime selection is deterministic: use an explicitly configured loopback PostgreSQL 17 first; otherwise use Docker/Podman with `postgres:17`; otherwise return `BLOCKED`. Never fallback to Supabase or any remote database.

The bootstrap owns only runtime preparation. Existing #630/#632 commands remain the verification authorities. Shell-specific wrappers may exist, but policy/domain logic remains in portable Node.js.

## Safety contract

Before any destructive lifecycle operation:

- PostgreSQL URL protocol must be `postgres:` or `postgresql:`;
- hostname must be loopback (`localhost`, `127.0.0.1`, `::1`);
- container binding must be loopback only;
- production/provider URLs are rejected;
- evidence/logging must redact credentials/tokens;
- synthetic credentials and per-run container/database names only;
- no production dumps or copied production rows.

## Container lifecycle

When native PG17 is unavailable but Docker/Podman exists:

1. start `postgres:17` with generated synthetic credentials and a loopback-only dynamic host port;
2. discover the assigned local port;
3. poll `pg_isready` using bounded readiness polling, not arbitrary sleeps;
4. inject the local admin URL into #630;
5. execute requested profiles;
6. teardown on success/failure and best-effort on SIGINT/SIGTERM.

## Verification design

Required evidence:

1. unit/contract tests for parsing, native/container selection and unsafe URL rejection;
2. cleanup after delegated failure;
3. exact-SHA propagation to #630;
4. no credential leakage in summaries;
5. #632 execution through `verify:local --profile database` on real PG17 when available;
6. financial profile when requested/applicable;
7. Windows PowerShell wrapper/documentation;
8. full candidate diff review; provider-blocked evidence remains separate.

## Out of scope

- paying for SaaS/provider upgrades;
- replacing PostgreSQL/Prisma;
- production deployment;
- production data cloning;
- Venezuela localization (#717);
- changing #630/#632 semantics except where a separately demonstrated defect requires it.

## Definition of Done

A clean checkout can prepare a PostgreSQL 17 isolated runtime at USD 0, delegate to the existing canonical DB verification chain safely, produce exact-SHA sanitized evidence, and tear resources down, with Windows/PowerShell documented as a first-class path. External providers remain optional.