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


## 2026-10-22 · Additional exact-SHA source-qa remediation

The root cause of repeated Vercel exit codes 179/194/201/202 is **not** generic Vercel spawn failure. The project wrapper emits distinct nonzero codes when sequential \`hipico-root-contracts\` native Node test files fail. Subsequent files do not run after the first failure: absence of their logs is **NOT PASS**.

The following fixes were made in this same PR without weakening runtime authentication, authorization, SOURCE read-only policy, financial logic, database permissions, production workflows or deployment settings:

| Native Node test / exact-provider evidence | Source-contract authority retained |
| --- | --- |
| \`tests/hipico_icon_action_contract_v41.test.mjs\` | Generated \`platform-tokens-v1.css\` owns 32/36/38/44px values; \`ui-system-v4.css\` owns components; \`ui-system-v4-convergence.css\` owns SVG alignment and floating Help/WhatsApp spacing; literal icon-registry checks account for conditional \`copy/check\`. Decorative \`ACTION_ICONS\` is tested separately from mandatory accessible \`ICON_LABELS\`. PWA r38 and non-cacheable sensitive requests remain verified. |
| Preview \`dpl_CR6gZHkXkNg49vK3fVfLb1NeJgKj\`, SHA \`5ac205d26bb1b8fda45c947c9b88c8f2e6b93566\` | Native v41 suite **9 PASS / 1 FAIL**, with the last false assertion treating \`'focus-fast': 'Captura rápida'\` screen-reader label as a forbidden action icon. Scoped the test to the actual action-icon registry; preserved the accessible label. Do not reuse this earlier 9/10 as current-head PASS. |
| Preview \`dpl_AQpeweuQ5osdxfDZE3aReSXWnbeW\`, SHA \`76b9504f3adec85f855c9ac88b1027ddaf8a4af8\` | Advanced beyond v41 and failed \`tests/hipico_mobile_touch_targets_297.test.mjs\` (two CSS-file-path assumptions), exit 194. Eight original CSS invariants were checked against actual imported legacy compatibility stylesheet. |
| Preview \`dpl_B4FAE227gmbhkPJFFs3VP5Jyv7jF\`, SHA \`5c5ef261ae461eae80b25711bc6c811fd440076a\` | Advanced beyond #297 and failed \`tests/hipico_operational_access_guard_279.test.mjs\` (two stale CSS/cache revision assumptions), exit 201. Assertions for hidden-by-default operational module, privileged auth gate, lazy import and purging state on loss of permission are retained. |
| Preview \`dpl_6eWi3dHjAHr6j6e19Ys1J2jpZx9H\`, SHA \`bd22d0a7ba1c1aa67b98e9b7fa84e8fab6fd2022\` | Advanced beyond #279 and failed \`tests/hipico_operational_copy_center_277.test.mjs\` (one stale CSS-file-path check), exit 202. Manual-only copy, no HTTP send, group isolation, 44px targets and motion preferences are retained. |

**Source versus runtime distinction:** The physical CSS architecture is a locally imported and layered bundle, not a single physical \`app.css\` file. Source-only checks establish that the guards exist; they do **not** establish actual computed browser layout, AA contrast, keyboard focus loops or offline reliability. The Playwright cross-browser/viewport tests remain mandatory.

**Execution blocker:** Native shell checkout using \`git ls-remote https://github.com/adelvisMartin/ContaGest.git HEAD\` could not resolve \`github.com\` from the isolated local container, so native local lint/typecheck/full Node/PostgreSQL/Playwright could not be executed there. Actual native Node assertions were executed only in exact-SHA Vercel source-qa previews as stated. The repository's GitHub Actions checks for recent candidate commits remained overwhelmingly queued/skipped at inspection; no local/CI green is claimed.

**Closure rule:** A preview build must reach READY for its own SHA and GitHub must complete required checks; only then can runtime production readiness for #688 and #720 be evaluated. #985 restore/rollback and #638/#979 security acceptance still require their independent executable gates. Do not merge or close the five tickets on a source-only repair.
