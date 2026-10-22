# PR #1281 · Security, correctness and release evidence (2026-10-22)

## Scope and authority

This is a source-level remediation on the **existing** PR #1281 (not a second PR). Related acceptance tickets: #688, #985, #979, #638, #720. The effective baseline before the batch was `main@0b9a78a15e1eb8d9afeeee2f39d86b87a6ab0ca1`. Every commit or deployment after this baseline must be validated under its own SHA; old successful checks do not automatically cover a new tree.

The code changes are deliberately limited to correct source-contract drift, fail-closed CRUD pagination/path parsing and real QA fixture behavior. No production DB migration, production auth/session relaxation, CI gate bypass, provider secret mutation, Hípico business behavior, or operational runtime deployment is authorized by this document.

## Exact-SHA failures that motivated changes

1. Production Vercel `dpl_8g8TxV3ALEwAfgvtnS8gASAWF2bR` at baseline `0b9a78a...`: BUILD_UTILS_SPAWN_103; stage `source-qa → contracts-current`; two stale assertions in `tests/tenant_isolation_adversarial_issue_641.test.mjs` after model-bound CRUD hardening. They assumed deprecated `tenantScoped=false` SQL and mistook static field labels for leaked foreign identifiers.
2. Preview `dpl_DjLSWRNZtojVwxF6q7s67DgZugaA` at PR SHA `8407eb574a8fdd00f7ead2ce563c531bfae5cf2a`: contracts-current progressed; subsequent `source-contract-pack` failed two stale `#289` assertions, expecting one physical v2 CSS file although the present offline v4 entrypoint imports compatibility, v4 and convergence sheets and HTML links a platform adapter. This was BUILD_UTILS_SPAWN_104, not proof of provider outage.
3. CI `39801113591` job `119901727190` at `8407eb57...`: `tests/crm_client_preflight_v760.test.mjs:94` temporary copy fixture omitted CRM lead/opportunity runtime modules required by `backend/scripts/copy-runtime-assets.mjs`. The production copy list exists; the test data was incomplete.
4. Release Candidate `39801113767` job `119901727565`: `qa/verticals-backend-real-v4851.test.ts:52` expected permission denial 403 but used a bearer JWT without server session `sid`, correctly rejected as 401 by `resolveBackendJwtContext`. The updated test explicitly preserves the 401 negative check and issues a real, cleanup-tracked fixture session before verifying 403.
5. PR Quality Gate `39801113421` has other exact-SHA failures, including security/audit and browser matrix checks; inspect job-specific logs and re-evaluate on the new PR SHA before assigning cause.

## Security invariants and implementation

- `backend/src/modules/crud-policy.ts`: explicit malformed take/skip values (empty string, non-integer, scientific syntax, NaN, unsafe numeric values) are rejected as 422; only absent values get the default. Finite valid values remain bounded. Route IDs accept legacy text but reject empty/trim-altered/control and excessive-length paths. Tenant injection, allowlists, RBAC, Zod and Prisma guarded predicates remain untouched.
- `tests/crud_factory_hardening_issue_638.test.mjs`: negative matrix covers the above cases; the existing model-bound permissions, no mass-assignment and no generic financial lifecycle rules remain in place.
- `tests/tenant_isolation_adversarial_issue_641.test.mjs`: insists on tenant+permission middleware, tenant-scoped list/read/update/delete, server-owned create tenant, strict input schemas and non-disclosing cross-tenant reference labels.
- `qa/verticals-backend-real-v4851.test.ts`: missing-session token must return 401, persisted session lacking permission must return 403. `qa/support/real-backend-harness.ts` tracks fixture sessions for cleanup; **never** fabricate a role/sid or bypass server session validation.
- `tests/crm_client_preflight_v760.test.mjs`: validates every explicit copy authority asset, byte equality and generated runtime directory under a disposable temporary fixture.
- `tests/hipico_command_center_289_contract.test.mjs`: enforces exact offline stylesheet count, order, v4 imports and protected legacy CSS layer. `frontend/public/hipico-control/STYLE-GUIDE.md` documents viewport/keyboard/contrast/status/security coverage.

## Acceptance and replay commands (from exact checkout)

Use the repository's recorded engine/lockfile. This repository uses Node 22/npm workspaces and `npm ci --no-audit --no-fund` in Vercel. Do not replace install with a different package manager without an authority decision.

```sh
git rev-parse HEAD
npm ci --no-audit --no-fund
node --test tests/tenant_isolation_adversarial_issue_641.test.mjs tests/crud_factory_hardening_issue_638.test.mjs tests/crm_client_preflight_v760.test.mjs tests/hipico_command_center_289_contract.test.mjs
npm run test:contracts:current
npm run typecheck
npm run lint
npm run build
npm run test:backend:verticals:real
```

The last command requires **isolated ephemeral PostgreSQL 17** with canonical migrations and synthetic tenant fixtures. Never point QA at Supabase production or shared tenant databases. Run the relevant Chromium and Firefox/WebKit/contrast checks as required by the workflows; do not skip or relax failed jobs.

A successful Vercel Preview is source/build evidence for its own SHA, not a successful production deploy. #688 closes only after a new production deployment is READY with the exact target SHA and post-deploy checks. #720 additionally requires real deployed-backend identity `contagest_runtime` plus safe auth/read/write/accounting smoke. #985 requires completed PostgreSQL 17 backup/restore and app-rollback drill. #979 needs runtime redaction/Problem Details v2 checks. #638 needs backend typecheck and isolated tenant A↔B authorization tests.

## QA state and merge policy

Source-file edits and prior provider logs are **VERIFIED** as such. New PR candidate `lint/typecheck/build/native tests/PG17/browser/security scans/Vercel READY` are **NOT VERIFIED** until actual workflow or build evidence is inspected; do not reuse old check statuses after pushing further commits. Status remains **PARTIAL / NOT_READY** if any required gate fails, is skipped unexpectedly or is queued. The owner may review this PR but must not force-merge, disable gates, reveal secrets or close tickets based on partial evidence.

## Follow-ups outside the five-ticket scope

Investigate outstanding source/security or visual failures from the **new** exact candidate separately; preserve failure details (file, line, expected/actual) and record which run corresponds to which SHA. Future Hípico v4 presentation or offline behavior changes need browser-render and accessibility evidence independently of source-only checks.
