# Hípico #305 — exact-SHA reverification progress

Date: 2026-09-13
Branch: `fix/hipico-305-preqa-release-regression`

This file records execution evidence only. It is not a release approval and must not be used to synthesize physical, soak, legal, governance or Android evidence.

## Executed candidate

Candidate: `9c75df1360126bcd562c80cb98f2c239444447b4`
Vercel deployment: `dpl_FBt3Q89LpcFyYYEmQtJceeRnL1Pc`

### Checkout and dependencies

- PASS: Vercel cloned branch `fix/hipico-305-preqa-release-regression` at commit `9c75df1`.
- PASS: package engine selected Node.js `22.x`.
- PASS: dependency installation executed; Vercel reported `added 1 package, and removed 1 package in 5s` and continued into build scripts.
- PASS: generated ERP and Hípico build identity bound both products to the exact candidate SHA.

### Source gate RED

`preqa:source` reached the Hípico root-contract suite and executed 402 tests:

- PASS: 400
- FAIL: 2
- skipped: 0
- todo: 0

The same exact-SHA run passed `2000 deterministic multigroup merge iterations preserve tenant isolation and freshness`. This is a 2000-iteration deterministic concurrency/merge test, not 2000 full-system release audits.

## Reproduced failures and classification

### 1. `tests/hipico_v1130_product_contract.test.mjs`

Failure: `bot retains canonical monetary review gates and atomic provider dedupe`.

Expected by stale assertion: literal `AbortSignal.timeout(10_000)`.
Actual runtime contract: `assertCloudTransportConfigured()` returns bounded `timeoutMs`; backend uses `AbortSignal.timeout(timeoutMs)`. Canonical timeout policy defaults to 12,000 ms, floors positive values at 1,000 ms and caps at 60,000 ms; a dedicated #305 timeout test verifies serverless parity.

Classification: `STALE_CONTRACT`.
Fix: product-level source contract now requires the canonical `timeoutMs` wiring instead of a retired literal timeout. Runtime behavior was not weakened or changed.

### 2. `tests/hipico_security_headers_297.test.mjs`

Failure: `Control Hípico reduces browser permissions while the explicit repo-wide scope retains report-only CSP`.

Expected by stale assertion: global CSP must specifically be `Content-Security-Policy-Report-Only`.
Current deployment architecture: Hípico keeps its stricter scoped enforced CSP in both Vercel configs; the actual frontend Vercel project also has an enforced repo-wide CSP. `tests/hipico_vercel_security_parity_305.test.mjs` passed on the same candidate and verifies Hípico header parity between root and frontend configs.

Classification: `STALE_CONTRACT`.
Fix: security contract now requires an explicit safe repo-wide CSP in both Vercel entry configs and still requires the deployed frontend project to enforce CSP. When the repository entry uses report-only rollout, its reporting endpoint remains required. Hípico strict CSP assertions remain unchanged.

## Next candidate

The two stale-contract fixes are parents of this evidence commit. The preview produced by this commit is the next valid exact-SHA candidate for GREEN verification. Only that preview can promote `preqa:source`, backend typecheck/tests and frontend build to PASS.

## Still independently blocked/not executed

- GitHub Actions runner-backed jobs: BLOCKED; a fresh rerun on 2026-09-13 again completed before any step (`steps=null`, no job logs).
- Android wrapper/APK: NOT_EXECUTED on the new candidate; GitHub runner prerequisite still blocked.
- Physical QA #119: BLOCKED on real-device evidence.
- Soak #120: BLOCKED on real >=24h evidence.
- Governance #97: BLOCKED on repository administrative controls.
- Legal #29: BLOCKED on external professional/legal evidence.

No merge, production deployment, migration, artifact signing or SOURCE write enablement is authorized by this document.
