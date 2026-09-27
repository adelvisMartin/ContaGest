---
name: contagest-secure-verification
description: Project-owned secure review/TDD gate for ContaGest and Control Hípico changes.
contractVersion: 2
---

# ContaGest Secure Verification

## Trigger
Every security-sensitive change and every non-trivial change requiring regression evidence before merge/release.

## Non-trigger
Do not execute third-party hooks/installers/binaries merely because a copied skill recommends them; do not expose credentials or production data.

## Authority
`AGENTS.md`, project-owned security/accounting/tenant policy and owner instruction outrank external review/TDD guidance.

## Source of truth
Changed source, project contracts/tests, backend authorization/RLS and exact-SHA runtime evidence.

## Graphify probes
Use to trace ownership/data flow and locate sinks/dependencies; never treat it as authorization or exploit evidence.

## Inputs
Behavior contract, changed files, exact SHA, routes/principals/data sensitivity, providers and required verification surfaces.

## Invariants
Review secrets, auth bypass, injection/XSS, redirects/path/file handling, SSRF, server validation, rate/cost amplification, tenant exposure, PWA caches, supply chain and monetary/irreversible automation. Backend policy remains authoritative; external-provider failure cannot corrupt domain state; Hípico automation remains auditable/kill-switchable and never gains implicit financial authority.

## Workflow
1. State preserved/changed behavior.
2. Static security review.
3. Verify authorization/RLS.
4. RED→GREEN→REFACTOR deterministic regression where practical.
5. Browser/PWA direct URL/refresh/history/mobile/offline as relevant.
6. Validate provider timeouts/limits/backoff/server-side secrets/failure behavior.
7. Record exact-SHA release evidence separately.

## Negative tests
Tenant/role abuse, dangerous inputs/sinks, provider failure, stale PWA cache, duplicate action/retry and unsafe automation paths as applicable.

## Stop conditions
Critical/high finding, bypassed backend authority, uncharacterized financial/settlement behavior, unsafe WhatsApp irreversible action or missing prerequisite required to verify safely.

## Verification
Run routed tests and inspect full output. Missing runner/browser evidence remains `BLOCKED`/`NOT_EXECUTED`.

## Output schema
Behavior contract; threats reviewed; tests and statuses; browser/runtime status; security findings; residual risk; rollback/block decision.

## References
`AGENTS.md`, `contagest-appsec-review`, `contagest-tenant-isolation-rbac`, `contagest-release-evidence`.
