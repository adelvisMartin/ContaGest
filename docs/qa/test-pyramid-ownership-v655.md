# Test Pyramid & Suite Ownership — issue #655

## Scope and policy

Baseline: `main@d9b3d9d9f44a5be84d44fdd23740882cbb3c368b`. Source-tree inventory observed **677 test files** (151 backend/src, 89 qa, 397 tests, 40 tools/Hípico bridge). These are **files, not assertions or successful executions**.

`config/test-pyramid-v655.json` is the machine-readable critical behavior ownership/level/command registry. `scripts/test-pyramid-audit-v655.mjs` automatically discovers the repository tests from **five bounded roots**, assigns a provisional level and owner to all discovered tests, and maps 13 explicitly protected behaviors. `--json` emits all inventory rows. Only the 13 critical entries carry manually assigned owners/levels. All other rows are tagged `INFERRED`, not certified.

The levels are `UNIT`, `CONTRACT`, `POSTGRES_INTEGRATION`, `BROWSER_E2E` and `PROVIDER_SPECIFIC`. A `.test.ts` in backend/src is heuristically unit, a `.spec.mjs` under QA is heuristically browser, and `.integration.test.ts` heuristically persistence; names **never prove** execution, fixtures, absence of mocks or equivalent coverage. Manually assigned critical paths still require actual runtime evidence.

## Commands and local profile #630

```sh
node scripts/test-pyramid-audit-v655.mjs
node scripts/test-pyramid-audit-v655.mjs --json
node --test tests/test_pyramid_issue_655.test.mjs
npm run verify:local -- --profile changed --base main --expected-sha "$(git rev-parse HEAD)" --dry-run
```

`full` and relevant `changed` profiles now insert the lightweight ownership audit + regression tests **without replacing or skipping their existing DB/browser/financial gates**. The original `backend` profile retains its exact authoritative commands (typecheck, tests, build); `tests/local_verification_runner_v630.test.mjs` continues to enforce it. The v630 workflow executes the lightweight gate before its core runner tests so its pass/failure can be attributed to the candidate SHA independently of pre-existing CI failures.

`--dry-run` is a plan, **not** PASS. Direct critical test commands in the JSON must be run against the environment named in each entry. No production database or WhatsApp account is used for destructive QA.

## Removal / consolidation policy

No suite is removed merely for elapsed time, failure, text similarity, overlapping ticket number, or the same filename suffix. To retire a suite: (1) prove its import/script/workflow and dynamic consumers; (2) demonstrate coverage equivalence of the exact negative behavior; (3) run corresponding PostgreSQL 17 real and/or Chromium tests; (4) record before/after timings and exact SHA; (5) update affected canonical runner references and protected behavior entry. `supersededBy` without `consumerProof` is rejected. Financial correctness and tenant isolation cannot be reassigned to mock-only unit contracts.

The baseline count is a fail-closed floor. It protects unexpected loss of files; it does *not* on its own prove test completeness or prevent replacing one unprotected file with another. Protected critical path checks supplement this floor.

## Evidence and remaining acceptance

- SOURCE_REVIEW: 677 test files observed at the stated baseline; classification/path checks are structural.
- LOCAL_UNIT: fixture tests run inside a remote workflow after publication to be recorded at **exact candidate SHA**; no pre-emptive PASS.
- LOCAL_POSTGRES: NOT_EXECUTED for this ownership-only change. Existing PG gates remain unchanged.
- LOCAL_BROWSER_E2E: NOT_EXECUTED for this ownership-only change. Existing browser gates remain unchanged.
- REMOTE_CI: distinguish issue-local preflight from the full CI/release pipeline.
- BEFORE/AFTER PERFORMANCE: NOT_EXECUTED; cannot claim improved wall-clock timings without a full checkout/runner comparison.
- DEDUPLICATE TEST RETIREMENT: NOT_EXECUTED; no suite has consumer proof for safe deletion as of this inventory slice.

Issue #655 stays open until remaining accepted consolidation and before/after performance evidence are complete; keep each gap explicitly visible in its issue and PR. Any new commit invalidates earlier positive evidence for changed gates. Rollback: revert the dedicated manifest/script/tests plus additive runner/workflow edits; original unit/DB/browser commands were not deleted.
