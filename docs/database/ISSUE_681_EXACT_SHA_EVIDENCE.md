# #681 — #632 exact-SHA PostgreSQL 17 evidence

## Target

- #632 candidate: `c44b58f0bd2f74df748dad96120751a987ed9e45`
- candidate base: `fa1197f0e1fb48c93b9f3a7173c1c44d5d628f3f`
- required engine: PostgreSQL 17, isolated and ephemeral
- production databases are out of scope.

## Previous run characterization

GitHub Actions run `36586492261`, job `109468107564`, did provision a real `postgres:17` service and checked out the exact #632 candidate. TypeScript typecheck passed. The canonical DB gate then ended as `FROM_ZERO_FAILED` before material migration execution because it resolved its default base ref `main` inside a detached exact-SHA checkout, where no local `main` branch existed. The job log contains `fatal: Not a valid object name main`.

This is harness/ref-resolution failure, not evidence that the migration chain itself failed. It is therefore neither PASS nor `BLOCKED_INFRASTRUCTURE`.

## Deterministic replay

`.github/workflows/issue-681-postgres17-exact-sha.yml` is an evidence harness only. It checks out the original #632 SHA, validates the original base commit, provisions PostgreSQL 17, installs locked dependencies, runs backend typecheck, and calls the existing canonical gate with both `--base <base-sha>` and `--expected-sha <candidate-sha>` explicitly.

The gate remains the #632 implementation from the exact candidate; this harness does not replace its migration, authority, tenant-isolation, upgrade, manifest or raw-SQL checks.

## Acceptance

#681 may close only when the replay produces `gate.json` with:

- `candidateSha == c44b58f0bd2f74df748dad96120751a987ed9e45`;
- `category == PASS`;
- no required check in `FAIL`, `BLOCKED` or `NOT_EXECUTED`;
- PostgreSQL server major version 17;
- artifact upload succeeds;
- service-container cleanup is performed by the runner.

A failing replay remains a real finding and must be corrected rather than relabeled.
