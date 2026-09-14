# Control Hípico — final hardening post-#312

## Goal
Consolidate the remaining Agent/Shadow (#288) and Command Center/UX (#289) work on top of the current `main` without regressing the canonical API, security, provider/document/lifecycle hardening, PWA/Android parity, or SOURCE/LAB safety boundaries.

## Non-negotiable invariants
- `/api/v1/hipico/*` remains canonical; legacy `/api/v1/hipico-bot/*` remains integration-only.
- SOURCE is read-only / SHADOW-safe. LAB may receive simulations.
- No LLM/model output gets direct SQL, shell, ledger, settlement or unrestricted production-write capability.
- Monetary or ambiguous evidence remains operator-reviewed and `financialAuthority=false` for external/provider evidence.
- All group/owner scopes remain explicit and isolated.
- Secrets stay server-only. Browser/BFF responses must not expose operator tokens, service-role keys or group JIDs.
- Offline/runtime metadata and API/auth responses remain `no-store` where required.
- Android wrapper must preserve byte/hash parity with the PWA runtime.
- No CI bypasses, skipped checks or fabricated evidence.

## Implementation sequence
1. Bring the versioned Agent/Shadow policy, engine, store, routes, golden corpus, integration tests and exact-SHA workflow into the current base. Rename the stacked `v16` migration to the next free migration (`v22` at plan creation).
2. Bring Command Center backend read model, authenticated serverless BFF and PWA shell/runtime into the current base.
3. Semantically reconcile shared files (`backend/src/app.ts`, `hipico-system.service.ts`, `frontend/package.json`, `index.html`, `sw.js`, `STYLE-GUIDE.md`, Android sync) instead of replacing newer main hardening.
4. Update migration contracts/workflows to include the new Agent/Shadow migration.
5. Verify source contracts, backend typecheck + `test:hipico` + `test:hipico:agent`, PostgreSQL contracts, PWA syntax, Android parity, build/runtime and browser/accessibility gates on one exact SHA.
6. Open the final PR to `main`, verify the PR head SHA, and merge only if remaining red checks are not code failures and the same candidate has executable green evidence for the required product gates.

## Verification focus
- Promotion is adjacent-only, RBAC/audit/idempotent, metrics-derived and fail-closed.
- Prompt/tool injection cannot alter policy or access secrets/tools.
- SOURCE defaults SHADOW and evaluation returns no direct effects.
- Command Center renders loading/error/offline/stale/unavailable without fabricated zeros.
- Theme supports system/light/dark without flash; keyboard/focus/reduced-motion and 44px touch contracts remain intact.
- Command Center API requires authenticated owner and proxies server-only operator credentials.
- Service worker never caches API/auth/runtime metadata.
- 2,000 deterministic seeded property cases remain effects-disabled unless the canonical policy explicitly allows a safe read-only action.
