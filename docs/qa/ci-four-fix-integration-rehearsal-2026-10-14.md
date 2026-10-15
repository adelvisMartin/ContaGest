# Coordinator-only CI rehearsal — 2026-10-14

> **ADVISORY / VALIDATION ONLY — NEVER MERGE THIS BRANCH OR PR.**
> This is **not** a fifth implementation claim. Each original issue/PR retains exclusive ownership. A combined result cannot be used as an exact-SHA PASS for any other PR head.

Baseline `main@cff24727bcb5bca1f0f585ad63562c7ea092dbe5`. Sources copied **without modification**:

| Exclusive issue | Source PR | Exact source SHA | Owned files |
|---|---|---|---|
| #977 | #978 | `4697dfc0319126ebeee8ebc0bd61ae53c70d760b` | `tests/erp_ui_wave_a_2_51.test.mjs` |
| #979 | #980 | `aa832863aaadcedd03fc3770e09da84504eb67b3` | `backend/src/shared/observability/contract.test.ts`, `qa/observability-v650.test.ts` |
| #984 | #986 | `c0703507d7c0e26df2a0c960dc5fc3b3dab7de75` | `tests/v11_13_pwa_security.test.mjs` |
| #985 | #987 | `a76a8d52b251dc915261b9afe05925dc496b3a1f` | `.github/workflows/production-ops-v566.yml`, `tests/production_ops_v566_contract.test.mjs` |

No path overlap. No runtime change except the pre-existing #985 **ephemeral PostgreSQL workflow** fix. No migrations or production secrets altered. Canonical `ops/database/prepare-supabase-ephemeral.sql` is unchanged.

## Test intent

Validate **combined** behavior on one disposable exact SHA, because each of the four isolated PRs has unrelated, pre-existing CI failures from the three other fixes. Use Node 22 and `npm ci` as declared by the project. Expected executable gates, when CI jobs are available:

- `node --test tests/erp_ui_wave_a_2_51.test.mjs`;
- `npm --workspace backend run test:observability`;
- `node --test tests/v11_13_pwa_security.test.mjs`;
- `node --test tests/production_ops_v566_contract.test.mjs`;
- existing CI / Supply Chain / PWA / OPS #566 PostgreSQL 17 / browser checks.

`PASS` is reserved for actual run results on **this rehearsal SHA only**; source review alone is not a test. A broken runner/provider or missing postdeploy proof is `BLOCKED` / `NOT_EXECUTED`.

## Follow-through

Coordinator reviews failures, fixes **only** in the owning PR branch, and serially merges individual PRs once their own required checks and branch HEAD have been revalidated against the latest `main`. Close this advisory rehearsal PR without merge once superseded. Never use this rehearsal to close #977/#979/#984/#985, nor declare production verified.
