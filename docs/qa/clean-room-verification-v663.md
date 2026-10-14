# #663 — Clean-room verification (exact SHA)

This is a **local source verification gate**, not a release approval. It composes the existing #630 runner, #668 PostgreSQL 17 zero-cost bootstrap and the Chromium functional browser smoke. It does not modify application, database schema, providers or checked-out source files.

## Entry points

From the **clean root** of an exact candidate checkout, with Node 22, npm 10, Git and a free local PostgreSQL 17 / Docker / Podman available:

```bash
node --test tests/clean_room_verification_v663.test.mjs
node scripts/clean-room-verification-v663.mjs --expected-sha "$(git rev-parse HEAD)" --dry-run
node scripts/clean-room-verification-v663.mjs --expected-sha "$(git rev-parse HEAD)"
```

PowerShell:

```powershell
$sha = (git rev-parse HEAD).Trim()
node scripts/clean-room-verification-v663.mjs --expected-sha $sha
```

## Execution contract

1. Require a full 40-character candidate SHA matching **HEAD**, a clean source checkout and repository root.
2. Create a new, detached **Git worktree** under a uniquely-owned OS temp directory. Never reuse the source `node_modules` or `dist` outputs.
3. Run the monorepo's actual locked npm installation: `npm ci --no-audit --no-fund` (`package-lock.json` is the authoritative lockfile; this repository does not currently use a pnpm lockfile).
4. Run `npm run test:verify:local` and `npm run lint` (root lint includes typecheck and contracts).
5. Delegate PostgreSQL 17 selection, an ephemeral **per-run database**, migrations/tenant checks and backend/frontend production builds plus loopback health readiness to `node scripts/zero-cost-bootstrap-v668.mjs --smoke --expected-sha <SHA>`. Missing native PG17 / Docker / Podman fails closed.
6. Run `npm run test:browser:functional`, which uses the repository Playwright Chromium project and its local frontend webServer. This is a frontend browser smoke; **it does not claim an authenticated end-to-end finance/database journey**, which belongs to #664.
7. After each successful command, reject unexpected Git changes; on error, do not run later stages. Unexecuted gates remain `NOT_EXECUTED`.
8. Always remove **only the owned** worktree/temp directory, including after failure. Never run migrations against an external/provider URL or delete a pre-existing worktree.

Only a loopback `LOCAL_VERIFY_DATABASE_ADMIN_URL` is admitted. The child execution environment is allowlisted; `DATABASE_URL`, `DIRECT_DATABASE_URL`, `GITHUB_TOKEN`, `QA_BASE_URL`, Supabase credentials and provider variables do not propagate. No provider/production fallback exists.

## Evidence and limitations

Output: `artifacts/clean-room-v663/<SHA>/manifest.json` with stage commands, status, exit code, duration, exact SHA and remote CI/deploy both marked `NOT_EXECUTED`. A dry-run writes `NOT_EXECUTED` records, not PASS. Stage stdout/stderr stream to the invoking terminal but are not copied into artifacts, avoiding unintended credential persistence.

A full run must be executed on **the final exact SHA** with actual PostgreSQL and Chromium to satisfy this issue. Isolated regression tests verify orchestration, cleanup, SHA mismatch and refusal of remote DB URLs; they are not proof that the real application bootstrap, migrations or browser paths passed. For full authenticated runtime/post-start business smoke, use #664. RC promotion is still owned by #647.

When a stage fails, inspect that stage's terminal output and the manifest; do not replace it with a green test from a different SHA. For a fresh run, start from a clean checkout; any untracked artifact outside ignored paths must be addressed before re-execution.
