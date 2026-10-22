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


### Password recovery #267: deterministic security regression

- Exact-SHA Preview \`dpl_FmjpJZpR7LtjNFuUbAF7jJjSVyM1\` for \`d435c28feab46250573bb3839d023878d194f64e\` failed \`hipico-root-contracts\` in \`tests/hipico_password_recovery_single_flight_v267.test.mjs\` (1/9 failure; exit 210).
- The failing test asserted an empty in-memory recovery token after only three \`Promise.resolve()\` turns. Those turns are not a contractual completion signal for the real async \`signOut → PUT → optional RPC\` sequence. The production source already sets \`recoveryAccessToken = ''\` **after the successful PUT and before** \`await markCredentialChanged(token)\`; provider 401/403 responses also invalidate the token.
- The updated test uses a deferred signal at the first attempted optional profile RPC as a deterministic barrier, then asserts consumed token, in-flight state, and inability to replay the recovery operation. No production credential code, provider error redaction, rate limiting, session semantics or control flow was changed; no \`waitForTimeout\`, sleeps or test skips were introduced.
- The earlier \`dpl_6eWi3dHjAHr6j6e19Ys1J2jpZx9H\` Preview failed \`tests/hipico_operational_copy_center_277.test.mjs\`, exit 202, due to stale physical \`app.css\` assertions for legacy-imported responsive CSS. This was source-contract drift, not a proven runtime copy leak. The guard still requires manual copying and forbids automatic send.
- This is **not** a native test PASS on the latest SHA until a new exact-SHA build executes. QA status remains PARTIAL / NOT_READY.


## 2026-10-22 · Security authority reengineering and current QA evidence (#1281)

### Real server and provider policy defect resolved in source
The Bridge's \`source-policy-gate.mjs\` already returned \`NO_GO\`, but the backend's \`hipico-bridge.routes.ts\` treated \`HIPICO_SOURCE_AUTO_REPLY_ENABLED=true\` as enough to advertise \`sourceSendPossible\` and create executable SOURCE reply outbox commands. This was a **server-side authorization divergence** from the selected WhatsApp Messenger Terms, not merely an obsolete source test.

- \`backend/src/modules/hipico/autonomous-reply.policy.ts\`: frozen reviewed \`SOURCE_REPLY_SEND_POLICY.status='NO_GO'\` and \`sourceAutoReplySendAuthorized()\`; an environment flag only controls shadow planning, never source-send permission.
- \`backend/src/modules/hipico-bot/hipico-bridge.routes.ts\`: uses the reviewed authorization gate for health, event-command creation and reply receipts; an authenticated but unauthorized SOURCE receipt is denied with 403. There is no new bypass, flag or broadening of tenant/RBAC/financial authorities.
- \`tools/hipico-whatsapp-web-bridge/src/preflight.mjs\`: compares backend readiness to **effective provider eligibility**, rather than comparing matching user-configurable flags. If policy denies send, \`sourceSendPossible:true\` must fail preflight.
- \`backend/src/modules/hipico/autonomous-reply.policy.test.ts\`, \`tests/hipico_real_operativa_shadow_contract.test.mjs\`, \`tests/hipico_security_review_issue_114.test.mjs\`: inspect server and Bridge fail-closed gates. The deterministic planner's unit tests may still simulate candidate replies; that does not create transport permission.
- Official references reviewed: WhatsApp Messenger Terms (https://www.whatsapp.com/legal/terms-of-service?lang=en&popup=false&retURL=%2F) and Messaging Guidelines updated 2026-09-23 (https://www.whatsapp.com/legal/messaging-guidelines?lang=es). **No provider permission was inferred**.

### Additional observable privacy hardening (#979)
\`backend/src/shared/observability/redaction.ts\` now censors unstructured email addresses in error messages and sensitive URL query values (email/phone/RIF/patient/client/user/tenant identifiers) in addition to credentials, bearer tokens, DSNs, Hípico capability links and signed URLs. \`backend/src/shared/observability/contract.test.ts\` has a synthetic-PII regression ensuring harmless URL parameters remain intact. The \`type/title/status/detail/instance\` semantics of RFC 9457 / legacy envelope are unchanged. **Native TS and HTTP tests of the latest SHA remain REQUIRED and are not claimed PASS.**

### Concrete presentation issue discovered during QA
\`frontend/public/hipico-control/recovery.html\` lacked \`platform-tokens-v1.css\` although the main index included it. The PWA recovery page now links both canonical stylesheets in the same order. Tests #266, #277, #v41 and #v412 explicitly validate the v4 multi-file CSS authority, 44px touch sizes, dark/system WCAG AA token contrast, PWA cache rotation, and native dialog focus. From the reviewed token pair \`#79B891\` foreground \`#08100B\`, the calculated dark/system primary contrast is ~8.33:1 (source-level ratio, not a substitute for browser computed-style review).

### Provider native source-qa progression (historical exact commits)
| Preview and SHA | First remaining nonzero native contract |
| --- | --- |
| \`dpl_FLR1cho8hMAqcbo35GaL6MqDfkXY\` / \`cda822b2c418bcd148dbb06b29031af926c59690\` | \`hipico_release_docs_305.test.mjs\` — release guide still declared Bridge 1.4.2 despite package/runtime/lock 1.6.0; release guide corrected without changing provider authorization |
| \`dpl_7Mt6wgWfyC7SgjKs5L3Z5zCGVa7D\` / \`39f6a30d82017ccde418e44812cc64f3a020a5b4\` | \`hipico_schema_backup_restore_v23.test.mjs\` — test expected an overridable backup role; actual script hardcodes \`hipico_backup\` and rejects privilege overrides |
| \`dpl_FtMQ3ZEkDoZqPHoMaVAjS6vyk9tr\` / \`243ee337d38c3f99f0956b82d8456ff0b4365fad\` | \`hipico_security_review_issue_114.test.mjs\` — test expected a retired client literal \`sourceSendPossible:false\` rather than actual backend+Bridge provider gate |
| \`dpl_CwtMVSjzwTBL635pv6ifjSPnpuaE\` / \`694dc3331054e3ba28e980c543c7eee3086eb38a\` | \`hipico_ui_release_contract_277.test.mjs\` — one-file v2 contract, current UI uses generated tokens and ordered v4 CSS layers |
| \`dpl_8MLKHN35QQA4diHTkr5ryu4g5a7H\` / \`89a22889c2266b1dc973c8b0b6f10c23a2d0734b\` | \`hipico_ui_system_v2_issue_266.test.mjs\` — 7/7 outdated v2 theme/layout checks; updated to seven v4 functional/accessibility controls |
| \`dpl_Efy4m1nYR8sxipKeu6PzAtoPv9B4\` / \`d717a288f70209399807ccf7aec157a0a3b88ad6\` | \`hipico_ui_system_v41_contract.test.mjs\` — generated token authority and r38 cache incorrectly asserted under old v4 files |
| \`dpl_zP6pCM1mueVLUN2eQ2ExWimnfMCt\` / \`0a2ad0288e89c3ce4cf7d8f3ba5df677acc38349\` | \`hipico_ui_v412_hardening_contract.test.mjs\` — modal/toast rules exist in actual v4 CSS imports, not tiny app.css entrypoint |

The build exit numbers \`BUILD_UTILS_SPAWN_235/244/250\` are produced by failed native *project contracts*, **not** by a proven provider memory/spawn outage. Passing source contracts on one older SHA does not certify the new SHA. The final candidate must be reviewed against its own Vercel deployment.

### Production catalog and advisor limits (#720)
Read-only Supabase/PostgreSQL 17.6 catalog: 3 dedicated roles with no BYPASSRLS; 83 examined tenant tables with RLS and no effective anon/authenticated write grants. **New security advisor warnings**: 16 \`public.hipico_*\` \`SECURITY DEFINER\` functions owned by postgres and callable by authenticated (none by anon), plus leaked-password protection disabled. These are risks requiring per-function consumer/owner/tenant proof and plan-eligible Auth settings review. INFO: some RLS-enabled table has no policies (possibly intentional deny-all). See \`docs/ops/data-security-legal-control-map-2026-10-22.md\` for names and official remediation sources. No production GRANT/REVOKE/ALTER or Auth configuration was changed.

### Exact closure
The PR remains **NOT_READY** until latest-HEAD native Node source contracts, backend TypeScript checks, PostgreSQL 17 disposable A/B tenancy and backup/restore/rollback, security Problem Details/log redaction, browser accessibility and Vercel production READY+HTTP smoke all pass. GitHub queued/skipped checks must never be treated as PASS. Do not disable checks, force merge, close five tickets, or claim regulatory certification.

### 2026-10-22 additional SOURCE transport defense (#110)

- The latest `b4993cbfefb98a36a3264b990a8917f289601fc4` Preview `dpl_GJ8DUfDpqAP9Y2MC1enLSWNsLJuK` failed `tests/hipico_whatsapp_safety_issue_110.test.mjs`, exit 250 (one failed/four passed). The old assertion searched for a constant `sourceSendPossible:false` in the browser Bridge, while runtime exposes computed capability; the more important finding was that `SOURCE_AUTO_REPLY_ACTIVE` had been calculated only from the environment flag and kill switch.
- Applied defense-in-depth to `tools/hipico-whatsapp-web-bridge/src/index.mjs`: `SOURCE_AUTO_REPLY_ACTIVE` now also requires `evaluateSourceAutoReplyPolicy(config).eligible`. This independent legal/provider gate is `false` under the 2026-10-15 Messenger review. Its status must not become GO by changing an environment variable.
- Regressions `tests/hipico_epic_102_implementation_handoff.test.mjs` and `tests/hipico_real_operativa_shadow_contract.test.mjs` now assert the extra policy predicate; backend `sourceAutoReplySendAuthorized` already separately enforces `SOURCE_REPLY_SEND_POLICY.status === 'GO'`. No data or network sending was executed to validate this.
- The correct operational status is **NO_GO on automated SOURCE writes** and **PARTIAL/NOT_READY for release** until the exact-SHA preview and integrated CI pass. The QA repairs do not grant WhatsApp permission.

### Visual v16 theme authority update (2026-10-22)

Preview `dpl_8ur9S4aD1T9ZjVubmeRnM5XSaojA` at `b03894064c2a1a574cd6965233ff0bbaedb92162` passed the prior Hípico native source and backend gates but failed visual-source audit with `runtime-not-light-dark` and `store-not-light-dark` (BUILD_UTILS_SPAWN_125). These were stale v16 audit assumptions that theme *preference* is only `light/dark`.

The current authoritative `frontend/src/design-system/uxContract.v1.js` **explicitly supports `light/dark/system` preferences**. The app normalizes preference, observes the OS `(prefers-color-scheme: dark)` media query and resolves an effective binary `light/dark` CSS mode, storing preference separately from `data-resolved-theme`. The store's normalization uses that same authority.

`scripts/visual-system-audit.mjs` now checks the actual three-preference contract, store normalization, `resolveThemeMode`, and binary resolved mode; `scripts/visual-source-gate-v16.mjs` consumes these named assertions and fails closed when absent. This is not bypassing UI quality—unauthorized theme preferences or removal of system resolution now fail. Visual/browser computed-theme and 200% zoom tests remain separate required gates. New Vercel Preview is scoped to its own exact SHA and is **not** inherited from the earlier failure. Do not claim READY without actual provider state.
