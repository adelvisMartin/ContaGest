# #668 Zero-Cost Reproducible Bootstrap — Design

## Status

Design approved in chat on 2026-09-29. This document captures the architecture before implementation, per project engineering rules.

## Objective

Guarantee that ContaGest can be developed, tested and verified with **mandatory infrastructure cost USD 0** while the product is not generating revenue. Supabase, Vercel, GitHub Actions or any other external provider may be optional conveniences, but no required local development, QA or database gate may depend on a paid plan.

## Baseline

- Repository: `adelvisMartin/ContaGest`
- Baseline branch: `main`
- Baseline SHA used for this design: `70cc4d52b063e15f99fe47fbd75c09f53db43763`
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

### Canonical entrypoint

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
  -> create isolated per-run database
  -> canonical migrations / synthetic fixtures
  -> #632 canonical database gate
  -> #630 database profile
  -> #630 financial profile when applicable
  -> backend/frontend readiness smoke
  -> sanitized exact-SHA evidence
  -> guaranteed cleanup
```

### Runtime selection

Selection is deterministic:

1. Detect an existing PostgreSQL 17 instance bound to loopback and usable with synthetic local credentials.
2. Otherwise detect Docker or Podman and start an ephemeral `postgres:17` container with:
   - random/non-default local port;
   - synthetic username/password;
   - per-run database name containing a safe run/SHA token;
   - healthcheck/readiness polling, never arbitrary sleep;
   - no production secrets or mounted production data;
   - automatic teardown.
3. If neither path exists, return `BLOCKED` with exact prerequisite guidance. Never fallback to Supabase/remote DB.

### Environment contract

The bootstrap must distinguish local/dev/test from production/provider variables and reject unsafe targets before any destructive command.

Required safety checks include:

- hostname is loopback (`localhost`, `127.0.0.1`, `::1`) for destructive DB lifecycle;
- database name is generated/ephemeral and not a known production name;
- no provider URL is accepted for reset/drop/fixture/migration-destructive flows;
- logs redact passwords, tokens, keys and connection credentials;
- generated evidence contains only sanitized metadata.

### PostgreSQL lifecycle

Each run owns its own database lifecycle:

- unique run id and candidate SHA;
- create DB/schema from zero;
- apply canonical migrations;
- load only synthetic fixtures required by gates;
- tenant A/B isolation fixture where required;
- run from-zero, upgrade and drift checks owned by #632;
- run database/financial verification profiles owned by #630;
- capture manifest/hash/evidence;
- cleanup in a `finally`/trap-equivalent path;
- prove second execution is safe and idempotent at the bootstrap level.

### PowerShell first-class support

The supported developer flow must work from the VS Code terminal on Windows. Shell-specific wrappers may exist, but domain logic should live in portable Node/TypeScript/JavaScript utilities where practical so PowerShell does not become a second implementation of the same policy.

### Provider neutrality

The bootstrap owns only the local test runtime contract. It must not introduce Neon, Supabase Local, Netlify DB or any other provider as a new authority. Provider-specific smoke/integration may run separately and be reported as `NOT_EXECUTED`, `NOT_APPLICABLE` or `BLOCKED_INFRASTRUCTURE` without invalidating local material evidence.

## Expected code areas

Exact filenames are to be confirmed during implementation after repository inspection, but expected touch points are limited to:

- canonical bootstrap script(s) under `scripts/`;
- package script wiring in the repository authority package manifest;
- environment validation helpers shared with #630/#632 where available;
- minimal PowerShell wrapper/docs only when necessary;
- `.env.example`/local documentation only if current contract is insufficient;
- tests for runtime selection, unsafe URL rejection, cleanup and idempotent re-run;
- documentation/troubleshooting for Windows native PG17 and Docker/Podman paths.

The implementation must prefer reuse over creating parallel verification authorities.

## Failure model

- Missing PG17 + no Docker/Podman: `BLOCKED`, not `FAIL` and not `PASS`.
- Unsafe remote/prod DB URL: hard `FAIL` before destructive work.
- Migration/gate failure on ephemeral PG17: real `FAIL`, preserve sanitized diagnostic evidence, then cleanup.
- GitHub Actions unavailable: `BLOCKED_INFRASTRUCTURE`/`NOT_EXECUTED`, separate from local verification.
- Supabase unavailable/paused/free-tier limited: provider-specific status only; canonical local gate remains independent.

## Verification design

Implementation is not complete until the candidate SHA is exercised proportionally to risk.

Required evidence:

1. repository lint/typecheck relevant to touched code;
2. unit/contract tests for prerequisite detection and URL safety;
3. PostgreSQL 17 real isolated execution;
4. #632 canonical gate on the ephemeral DB;
5. #630 `database` profile;
6. #630 `financial` profile when current repo/runtime supports it;
7. backend/frontend health smoke when applicable;
8. injected-failure cleanup test;
9. successful cleanup test;
10. second-run/idempotency test;
11. exact SHA + manifest hash recorded in sanitized artifact/output;
12. diff review for secrets, dead code and duplicated authority.

Remote CI is reported separately and is never called PASS unless it actually executes for the same final SHA.

## Security considerations

- never echo connection strings with credentials;
- generate synthetic credentials per run;
- bind ephemeral database to loopback only;
- reject known remote/prod hostnames before reset/drop;
- no production dumps;
- cleanup containers/databases even after failed test phases;
- do not weaken authentication/RBAC/product isolation to simplify bootstrap tests.

## Out of scope

- paying for or upgrading any SaaS plan;
- migrating ContaGest away from PostgreSQL;
- replacing Prisma or current persistence architecture by fashion;
- deploying production;
- copying production data locally;
- modifying the semantics of #630/#632 unless implementation exposes a real defect requiring a separately justified fix;
- implementing Venezuela localization (#717) in this ticket.

## Definition of Done

A clean checkout can prepare a PostgreSQL 17 isolated runtime at USD 0, execute the existing canonical database verification chain safely, produce exact-SHA sanitized evidence, and tear everything down, with Windows/PowerShell documented as a supported first-class path. External providers remain optional and cannot block local PASS when the local material contract succeeds.
