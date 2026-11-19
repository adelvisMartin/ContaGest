# ContaGest #1364 — threat-boundary review and incremental evidence

**Date:** 2026-11-19 · **BASE_SHA:** `bb13003cb77efc1c4c37390a0c6d8414f6232aa9`  
**State:** PARTIAL; source review and bounded unit tests only. **No AppSec sign-off, AAB certification, runtime PG17 evidence, or release authorization.**

## Ownership / exclusion

- #1364 owns incremental app/API abuse hardening, confidentiality matrix and adversarial evidence.
- #1360 owns signing, reproducible AAB and Google Play release; #1361 owns Keystore, attestation and device-binding authority.
- #1362 owns licencing/RBAC and client portals; #635/#720 own PostgreSQL role/RLS convergence; #1312/#851 own canonical server sessions.
- **Control Hípico remains outside this Play ticket** (#837/#839); no Hípico behavior, WhatsApp, payouts or race logic changed.

The **browser/Android JS is not trusted**. These client controls reduce accidental leakage and repacking usefulness but **do not replace backend auth, tenant, license, RBAC, RLS or Play Integrity**.

## Threat model snapshot (STRIDE, source-grounded)

| Threat / boundary | Asset and path | Existing owner / source | New control in this PR | Residual risk and required QA |
| --- | --- | --- | --- | --- |
| Spoofed API host or poisoned localStorage (S/I) | Browser or WebView → `BackendApi` → auth/ledger/API | `frontend/src/services/backendApi.js` | Resolve a canonical HTTPS `/api/v1` only on same-origin web or build-approved hosts; native release fails closed without configured HTTPS | Test signed release with configured Play API; browser CSP and provider HTTP headers still unverified |
| HTTP redirect across trust boundary (I) | Credentialed HTTP request → 3xx location | `fetchApi`, WHATWG Fetch `redirect` | `redirect: 'error'` on both primary and web same-origin fallback | Test real 302, cookies/CSRF with an isolated HTTP fixture |
| Lost response / duplicate write (T) | POST to external API → network failure → origin fallback | Existing `financialRequestSignature` and idempotency keys | Only GET/HEAD/OPTIONS may use same-origin fallback; unsafe methods never fall back to a second origin | Dedicated integration test covers write; complete finance replay and DB transaction tests pending |
| Browser credential persistence (I) | Auth response → `AuthSession.set/get` → localStorage | `authSession.js`; server cookies from #851 | Redact credential-looking keys recursively; rewrite credential-bearing stored legacy snapshots; evict invalid sessions | Test IndexedDB, browser profiles, logout/revocation, tenant switch, backup/restore and physical Android |
| Object enumeration, BOLA/BFLA (E/I) | Auth/tenant/user → media, reports, list/export → PostgreSQL | `backend/src/shared/middleware/context.ts`, media and tenant policies | **No backend authorization change in this PR** | PG17 2 tenants × 2 clients × roles; deny direct IDs, search/export, signed media |
| High-volume scraping/resource abuse (D) | Lists/exports/CPU/storage | `backend/src/shared/middleware/security.ts` rate-limit 8.7.3 + metrics | Source review only. Existing `standardHeaders: true` provides Retry-After on blocked requests according to upstream library documentation | Run synthetic scraping and normal user traversal on isolated API; compare 429 thresholds, NAT false positives and p95 |
| Mobile tamper/replay (S/T) | Repacked APK, device keys, Play Integrity | #1360/#1361 | No parallel attestation mechanism | Binary/AAB and physical-device test evidence required |
| Confidential database/storage backup (I/T) | PostgreSQL → Supabase media → backup → recovery | RLS/security/DR owners | No new unverified field encryption or KMS claims | Classify/review real provider storage+keys, restore on ephemeral PG17, rotate/revoke KMS, measure recovery |

**Severity:** These are *risk paths*, not claims of confirmed exploitable production vulnerabilities. A proven cross-tenant or secret-leak path would block promotion as P0/P1.

## Changes and alternative considered

1. **Chosen:** small project-owned `resolveApprovedApiBase` policy used by the existing `BackendApi`, safe fetch semantics and session-storage redaction; no new auth or cryptographic system.
2. **Rejected:** global rewrite of the client transport, catch-all native plugin, opaque JS obfuscator or blanket encryption of code/assets; high migration cost and no increase in server-side authorization.

**Compatibility:** Web deployments on HTTPS with relative `/api/v1` continue to work; loopback in local development remains permitted; remote production API destinations must be provisioned at build time with `VITE_API_BASE_URL` / `VITE_API_ALLOWED_ORIGINS`. Android release must provide a real approved HTTPS origin. Rejected `setBaseUrl` values are removed rather than used to send cookies. The upstream origin is not editable by user storage alone.

## Regression evidence

| Gate | State | Evidence |
| --- | --- | --- |
| SOURCE_REVIEW | PASS (partial) | Read current `backendApi.js`, `authSession.js`, Express limiter, auth service, SW and project security rules using GitHub connector |
| LOCAL_NODE_UNIT | PASS (bounded local mirror, new regression) | Node 22.16: 30/30 isolated tests on URL policy and AuthSession, including 1,000 synthetic hostile URLs; 0 failures. The GitHub transport integration test is still unexecuted. |
| RED_TO_GREEN | PASS (bounded local mirror) | Credential retention test initially 2 fail / 1 pass; after redaction 3 pass / 0 fail; expanded cases green |
| LOCAL_STATIC | PASS (bounded local mirror) | `node --check` on both modules and both isolated test files |
| TRANSPORT_NODE_INTEGRATION | NOT_EXECUTED | Included in `npm run test:security:api-base` on PR, but repository checkout unavailable locally |
| ROUTER / ORCHESTRATOR | BLOCKED | Repository-local `node scripts/agent-ticket-router.mjs gates --base main --type feature` needs full checkout |
| TYPECHECK / LINT / BUILD / POSTGRES / DOCKER / E2E / SAST | NOT_EXECUTED / BLOCKED | No complete repository or Docker in this container |
| REMOTE_CI exact HEAD | QUEUED or SKIPPED (not PASS) | Inspect current SHA workflow results before declaring status |
| Android signed artifact / Play / provider encryption / KMS / PG17 restore / pentest | NOT_EXECUTED | Separate evidence and owners required |

The local mirror is a **subset**, not the full Git checkout and not an exact-SHA release certification.

### Required next gates before merging

- Full checkout at candidate SHA, `npm ci` (Node 22), router and release-evidence gates; `npm run test:security:api-base`, lint/typecheck/build, existing contracts, static/secret audit.
- HTTP fixture verifies 302/CORS/CSRF/401/429 headers without exposing credentials. Verify approved/nonapproved hosts and no mutation retry.
- Isolated PostgreSQL 17 tenant A/B, role and owner authorization; synthetic scraping with measured normal pagination and p95 overhead.
- Full mobile-specific assessment: native initialization, release AAB/manifest, debuggable/cleartext, version/signature, Keystore/Play Integrity, session recovery, Android backup.
- Operational encryption/data-safety matrix, KMS/secret rotation, encrypted restore drill and independent AppSec/owner sign-off.
- Recheck exact-HEAD required CI. **Do not merge this draft while material P0 acceptance criteria remain unverified.**

## Second-pass FODA and rollback

- **Strength:** Reuses existing server auth and client transport; minimizes duplication.
- **Opportunity:** A single URL policy and session redaction now have negative tests; a shared security error UX for 401/429 can follow after server contract evidence.
- **Weakness:** No full checkout, actual Play binary or DB/backup provider evidence in this review; mark NOT_EXECUTED.
- **Threat:** Repacking and authenticated scraping remain server-side problems even with a safe client origin. They are not “solved” by URL checks.
- **Rollback:** revert this branch's changes; no migration, table/drop, user records or Hípico state modified.

### Official references checked 2026-11-19

- OWASP API1/API4: https://api-security.owasp.org/editions/2023/en/0x11-t10/
- OWASP MASVS: https://mas.owasp.org/MASVS/
- MDN redirect safety: https://developer.mozilla.org/en-US/docs/Web/API/Response/redirected
- Express rate-limit headers: https://express-rate-limit.mintlify.app/reference/configuration
- Android Security: https://developer.android.com/privacy-and-security/risks/

## 2026-11-19 · Third-pass targeted regression (after draft PR creation)

- **Verified RED→GREEN, local mirror only:** A production web origin `http://contagest.example` previously returned `/api/v1` from the API policy. Expected `''` (fail closed); actual `'/api/v1'` before fix. The added policy guard rejects non-HTTPS production documents while leaving HTTPS and explicit development loopback intact. OWASP MASVS-NETWORK and MASWE-0026 support enforcing secure transport.
- **Verified RED→GREEN, local mirror only:** Nested `accessKey`, `sessionCookie` and `authorizationHeader` persisted in AuthSession snapshots despite credential redaction. The narrow alias filter now removes them without discarding `passwordChangeRequired`, `authorizationStatus` or non-secret `secretaryName`.
- **Source-reviewed test correction:** HTTP fallback clears `contagest_api_base_url`. The original next test expected the prior absolute base URL without reapplying configuration. It now re-sets the approved origin before the POST and AbortError scenarios, preserving substantive assertions: no POST retry, no retry on cancel, and fail-closed native/insecure web paths.
- **Observed isolated command:** `node --check` on policy and AuthSession plus `node --test` on the local minimal mirror (policy, session, hostile-origin test, insecure-web test, aliases) → 30 PASS / 0 FAIL / 0 skipped. Environment Node v22.16.0, no repository .git/lockfile/node_modules. These local tests are **not** exact-HEAD full repository certification.
- **External guidance:** https://mas.owasp.org/MASVS/08-MASVS-NETWORK/ ; https://mas.owasp.org/MASWE/MASVS-NETWORK/MASWE-0026/ ; https://developer.mozilla.org/en-US/docs/Web/API/Response/redirected ; https://www.rfc-editor.org/rfc/rfc9110

**Security scope:** Preventing frontend cleartext traffic and credential snapshot persistence does not prove API authorization, cryptographic key management, Play Integrity, Android store readiness, encrypted backup/restore, penetration testing, or tenant A/B isolation. The mandatory backend/postgres/native/external gates remain P0 acceptance blockers; no merge.

## Fourth pass — exact source-blob transport regression (2026-11-19)

**Supersedes earlier `TRANSPORT_NODE_INTEGRATION: NOT_EXECUTED` for the targeted Node test only.** The whole monorepo, browser, Android, database and remote CI remain unverified.

- **Production behavior and backend contract:** `BackendApi` queries Capacitor status on each request; prevents a late-installed native bridge from continuing relative `/api/v1` traffic. Retains no cross-origin POST/PUT/PATCH/DELETE fallback; throws before fetch on an unapproved origin or insecure production document.
- **Transport test initial FAIL:** exact published `tests/backend_api_origin_transport_v1364.test.mjs` expected a same-origin read to retry against relative `/api/v1`. Actual one request was correct because the current origin was already HTTPS same-origin. Changed assertion to require exactly one request and preserve selected approved API host; executed RED→GREEN without disabling assertions.
- **429 handling:** `BackendApi` preserves bounded `retryAfterSeconds` for status 429 from numerical and HTTP-date `Retry-After`, including raw responses. The test proves 429 is not automatically retried and ignores malformed retry values. This is client contract validation, **not** proof that deployed rate-limiting produces 429 under scraper load or that UI displays a countdown.
- **Executed on exact source blobs:** GitHub `fetch_file` for six touched frontend/tests files, materialized as partial checkout and each checked using `git hash-object` against GitHub blob SHA. Command:
  `node --test tests/api_base_origin_policy_v1364.test.mjs tests/auth_session_credential_sanitization_v1364.test.mjs tests/backend_api_origin_transport_v1364.test.mjs`
  ⇒ **31 PASS, 0 FAIL, 0 SKIPPED** on Node 22.16.0. `node --check` on transport and integration test also passed.
- **Scope of evidence:** The six source blobs exactly match the HEAD-specific GitHub paths, but the test was run in an isolated directory rather than cloned `git` worktree. No `npm ci`, router, lint, typecheck, build, Playwright, physical Android, P0 tenant/role penetration testing, PostgreSQL 17, encryption/KMS or backup restore was executed. CI of the candidate remains queued/pending/skipped/cancelled, not PASS.
- **Follow-up requirements:** run `npm run test:security:api-base` under the full repo with frozen dependencies and all relevant gates; verify 429/Retry-After via isolated real Express HTTP test including normal paginated usage and false positive/p95 metrics; no merge until #1364 P0 security/Android/DB evidence and independent AppSec reviewer.

Exact current regression blob SHAs at evidence time:
- `frontend/src/services/backendApi.js`: `296de74630038e449e8f1ab7ee6a68c343cd062d`
- `frontend/src/services/apiBaseOriginPolicy.mjs`: `954d3c4b7418d0636e4f3f2472cb8a4fcacfa9fe`
- `frontend/src/services/authSession.js`: `29f51ffc8b80dba1c1513fb07f3bbb4210f9e80d`
- `tests/api_base_origin_policy_v1364.test.mjs`: `22b298b67ed4269b0de4cef60d70c6eec604abd5`
- `tests/auth_session_credential_sanitization_v1364.test.mjs`: `644cd9f700079fc03a583e67985cb6fb7bbd668e`
- `tests/backend_api_origin_transport_v1364.test.mjs`: `73068a183d08ec166d038745b705b7dd19e405f1`

## Fifth pass — abort-safe financial transport and anti-scraping source audit (2026-11-19)

**Evidence classification:** targeted source and Node test verification, **not** a full AppSec/Android/API release sign-off.

### Confirmed issue: AbortError retries financial writes

- **Reproduction:** `BackendApi.request('/fiscal/close-period', {method:'POST', ...})` with a generated idempotency key and a fetch implementation rejecting with `AbortError`.
- **RED before fix:** `tests/backend_api_abort_idempotency_regression_v1364.test.mjs` expected exactly one fetch and received **2**; an outer retry path in `frontend/src/services/backendApi.js` ignored aborted requests when an idempotency key existed.
- **Minimum fix:** inside the request's catch, stop on `AbortError` or `fetchOptions.signal.aborted` before executing the idempotent retry. Keep the existing `status=0` error contract, adding `payload.cancelled: true` for callers; do not retry a cancelled operation.
- **GREEN after fix:** three tests exercise (1) generated idempotency key + AbortError, (2) explicit key + already aborted AbortSignal while fetch throws TypeError, and (3) permitted transient failure that DOES retry once using the exact same key. The pre-existing 31 source-blob tests still pass. **34 PASS, 0 FAIL, 0 skipped** with Node v22.16.0, command `node --test tests/api_base_origin_policy_v1364.test.mjs tests/backend_api_origin_transport_v1364.test.mjs tests/auth_session_credential_sanitization_v1364.test.mjs tests/backend_api_abort_idempotency_regression_v1364.test.mjs`.
- **Exact source evidence:** `git hash-object` of each of the seven tested files was checked against the corresponding GitHub blob SHA; `node --check` passed on seven files. Locally captured TAP log: `qa-abort-idempotency-v1364.log`, SHA256 `e46aeec0a01cb4f149e7cfa1ebaffe41a1cddcd5402452452c224c4544d78b11`. The targeted files were materialized into an isolated mirror; the full Git worktree remains unavailable.

### Additional source-risk finding: rate limiter counter scope

- **Verified source:** the five `express-rate-limit` declarations in `backend/src/shared/middleware/security.ts` (`globalRateLimit`, `mutationRateLimit`, `expensiveOperationRateLimit`, `authRateLimit`, `cspReportRateLimit`) set local limits without an explicit shared `store`.
- **Documented library behavior:** without an external store, the library defaults to a process-local `MemoryStore`. Multiple processes/instances do **not** share enforcement counters, and aggregate permitted hits can multiply with instance count. Official source: https://github.com/express-rate-limit/express-rate-limit/blob/main/docs/overview.mdx and https://github.com/express-rate-limit/express-rate-limit/blob/main/docs/reference/stores.mdx. OWASP API4:2023: https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/.
- **Risk, not confirmed exploit:** multiple active backend instances and gateway policies have **not** been verified in this workspace; do not claim a production bypass. For multi-instance deployments, require measured aggregation via shared durable limiter (Redis or an approved platform/gateway quota) with an explicit outage policy, scope, key strategy, false positives and tenant/user fairness. Do **not** silently add a new provider, Redis secret, schema or dependency without owner approval and isolated production-like tests.
- **Acceptance blocker:** synthetic normal pagination + authorised abuse campaign across 2+ ephemeral API instances and rate-limit 429/Retry-After log/metrics must be observed on the candidate SHA, with isolated test data. Current state **NOT_EXECUTED**. This remains a P0 anti-scraping gate.

### Staff+ advisory after correction

- **Strength:** retained original financial idempotency retry behavior for genuine temporary failures while honoring abort, with minimal code change.
- **Opportunity:** verify user-facing UX for cancelled requests vs offline network failures and 429 Retry-After in an actual browser/device; never claim checked by Node mocks.
- **Weakness:** source-scoped tests cannot certify actual PostgreSQL, native bridge, rate limiting, UX or app binary.
- **Threat:** a shared limiter absent under horizontal scaling can weaken throttling; evidence required for deployment topology and response metrics.
- **Decision:** PARTIAL / NOT_READY_FOR_MERGE. Preserve draft PR, keep #1364 open, no Control Hípico or production deployments.

## Seventh pass — uncontrolled sync export destination and HTTP 307 (2026-11-19)

**Risk path source-reviewed end-to-end:** `SettingsPage.mount` reads `Store.get().settings.backendUrl` from a user-editable backend URL; `DataSyncService.pushAll` serializes 14 business resources, including clients, ledger, banking and suppliers, and uses `apiClient.apiPost`. Previously that client followed a 307 to another HTTP host and `DataSyncService` did not validate destination trust. This is an outbound export boundary; no real customer data or external servers were accessed.

### Reproduced and fixed

1. **Redirect POST leak (RED→GREEN, real local HTTP):** two ephemeral `node:http` servers, synthetic financial payload and a 307 Location to the second server. Before: `apiPost` followed the redirect and the negative assertion failed; after: both `apiGet` and `apiPost` set `redirect:'error'`; the second server received **zero requests** while ordinary GET/POST still succeeded. No redirect-to-external credential or body transfer.
2. **Untrusted manual backend URL (RED→GREEN):** a browser-context test called legacy `apiClient.apiPost('https://malicious.example/api/v1', ...)` and confirmed the pre-change transport attempted it; a separate source audit showed Settings selected the target. Rather than modify generic transport contracts further, `DataSyncService.health/pushAll/pullAll` now performs one fail-closed `resolveApprovedSyncBase` preflight before any transfer. Trust is defined by the existing canonical `resolveApprovedApiBase`: same-origin HTTPS or bundle-approved HTTPS; local loopback only in development; native release needs an approved HTTPS backend. The helper also preserves the legacy approved origin-root form to avoid changing accepted URL shapes unnecessarily.
3. **UX copy:** the Settings `backendUrl` field has `aria-describedby='backendSyncOriginHint'` linking to text that explains approved destinations. The project `Field` component is source-verified to forward `attrs` to the input. No browser, mobile or screen-reader testing is claimed.

### Targeted verified QA, exact source files

- Seven files were reconstructed in a partial Node 22.16.0 workspace and matched against GitHub blob SHA via `git hash-object`: `apiClient.js`, `apiBaseOriginPolicy.mjs`, `dataSyncService.js`, `uiEnhancementService.js`, `api_client_redirect_guard_v1364.test.mjs`, `data_sync_origin_guard_v1364.test.mjs`, `data_sync_service_guard_v1364.test.mjs`.
- `node --check` passed for all 7/7; `node --test tests/api_client_redirect_guard_v1364.test.mjs tests/data_sync_origin_guard_v1364.test.mjs tests/data_sync_service_guard_v1364.test.mjs` passed **12/12**, 0 failures, 0 skips.
- Evidence: `qa-sync-origin-20261119.log`, SHA256 `f3829af545febcbb2329ebecb032fff8eb2dcbd8211bd038b6d35fae9dd24161`.
- The repository's `npm run test:security:api-base` now includes all seven #1364 test files; the entire merged suite was NOT EXECUTED in a complete checkout. Earlier six suites' results must not be transferred to a new SHA.
- The manually configured backend URL is now subject to an **explicit contract change**. If an existing tenant integrates a custom remote sync host not present in `VITE_API_BASE_URL` or `VITE_API_ALLOWED_ORIGINS`, the sync correctly rejects it until the approved HTTPS destination is provisioned in the bundle. Acceptance review and release testing are required before merge.

### Remaining security scope

**Still unverified:** approval of configured cross-origin sync destinations by owner; Android HTTPS/cookie/CSRF integration; A/B PostgreSQL17 tenant isolation and data authorization; deployed 429/Retry-After under synthetic abuse and replica scaling; encrypted backups/rotation; CSP enforcing vs Report-Only; Play AAB physical checks; full lint/typecheck/build/E2E; second AppSec reviewer and exact-HEAD CI. WebView and browser UI accessibility were inspected in source only, **not physically verified**. No automated scraping against third-party sites, production, Control Hípico SOURCE, or real personal data was used.

**Decision:** PARTIAL, draft PR / NOT READY FOR MERGE.

## Eighth review — atomic local sync and tenant/user race (2026-11-19)

**Scope of this incremental cut:** `DataSyncService.pullAll()` and the Settings download UI. This is local state integrity, **not** an atomic multi-endpoint database snapshot or backend authorization proof.

### Root cause and corrections

- **Local partial import (P1 risk in client):** previously, each successful `/api/<resource>` GET immediately wrote into a draft. A subsequent 503 could leave clients, accounting and taxes partly replaced; `SettingsPage` ignored `results[].ok`, then `Store.import(draft)` persisted the partial draft and displayed a success toast. Source flow confirmed: `SettingsPage.mount` → `DataSyncService.pullAll` → `apiClient.apiGet` → `Store.import` (which normalizes, persists and emits). The local RED test asserted the draft should remain unchanged but observed several overwritten resources.
- **Implementation:** stage all 14 results separately. Only write them into the caller's draft after all GETs succeed. Return the existing 14-element result contract, including per-resource `ok`/error status; no fake transaction or global financial logic changes.
- **UI:** the download handler refuses `Store.import` if any resource failed, displays a specific incomplete-download error, and controls `disabled` + `aria-busy` on the button during the request, releasing it in `finally`. No success toast is shown after a partial failure. Full browser, screen-reader and theme verification remains **NOT_EXECUTED**.
- **Session switch in-flight:** the request can span a tenant/user switch. The service now captures `AuthSession` identity (tenant+user) before downloading and rejects with status 409 before writing a draft when either changes. This avoids applying a mixed A/B response set. It deliberately permits a routine refresh of the same tenant+user; server auth/RLS remains authoritative.
- **Remaining risk:** same-identity ABA changes (A→B→A) and concurrent changes of business state during a long pull are not proven safe under full integration; a monotonic session/revision guard and real browser E2E could be added only with repository-wide validation. Also, 14 separate API GETs cannot guarantee a consistent backend snapshot during concurrent writes; a transactional snapshot contract would require a separate backend-authorized change.

### Exact local RED → GREEN evidence

- **RED first:** `node --test tests/data_sync_atomic_import_v1364.test.mjs` against source blob `4e8aa3c18d272a256ff76792db0a506462d7fcd7` failed because a 503 after earlier successful reads changed the local draft. The separate user/tenant switch negative test failed before the identity guard (`Missing expected rejection`).
- **GREEN:** `node --test tests/data_sync_atomic_import_v1364.test.mjs tests/data_sync_service_guard_v1364.test.mjs` on Node v22.16.0 → **9 PASS / 0 FAIL / 0 SKIPPED**, including 14 distinct failed-resource positions, tenant A→B, user A→B and same-identity refresh. `node --check` of touched service and regression test passed.
- **Source provenance:** `git hash-object` confirms exact published blobs for `frontend/src/services/dataSyncService.js` (`efe324aee28cc19f0d38ff4925284513de50fdd6`), `frontend/src/services/authSession.js` (`29f51ffc8b80dba1c1513fb07f3bbb4210f9e80d`), `frontend/src/services/apiClient.js` (`5f5e74d4fb7140b878a29524d50237ba42d1fa97`), `frontend/src/services/apiBaseOriginPolicy.mjs` (`70d60bb2f97fb752b7e79a1bb5c22ac229eac3fc`), `tests/data_sync_atomic_import_v1364.test.mjs` (`764eb0e1c8a0ad376de97fa9f5b76702e5d0e652`), and `tests/data_sync_service_guard_v1364.test.mjs` (`68e8739b2cc0aa89a711f5567a566dcf99d4282b`). An isolated `uiEnhancementService.js` no-op side-effect stub was used in Node to avoid unrelated DOM; that module itself was **not** runtime tested here.
- **Evidence artifact:** `qa-session-guard-9tests.log`; SHA256 `aecf00d4364eec58343c1a80526efb4004e44979078a15dd1c4e3facb16ca824`.
- `package.json` adds the new regression to `npm run test:security:api-base`, which itself remains part of `npm test`.

### Staff+/AppSec verdict

- **Strength:** data is not imported on partial download, no naive retries or extra persistence added, cross-tenant change guarded.
- **Opportunity:** true browser E2E for button busy/error/success, keyboard and focus plus A/B cookies/RLS verification.
- **Weakness:** no full checkout or CI passing gates; a Node mock is not physical Android or a production response.
- **Threat:** unresolved stale-identity races and absence of server-side multi-resource snapshot guarantee. Classify as follow-up or blocker according to owner/security review.
- **Decision:** **PARTIAL / NOT READY FOR MERGE**; independent reviewer and all #1364 P0 gates remain mandatory. No Control Hípico, betting, scraping third parties or production DB operations.
