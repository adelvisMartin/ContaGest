---
name: contagest-cloudflare-security-audit
description: Project-owned wrapper for the pinned Cloudflare security-audit methodology; external guidance remains advisory.
contractVersion: 2
---

# ContaGest Cloudflare Security Audit

## Trigger
Deep, source-first defensive security audits and remediation coordination using the pinned Cloudflare methodology.

## Non-trigger
Never run destructive exploitation, brute force, credential attacks, production mutation, paid-provider traffic or upstream executables merely because vendored.

## Authority
Precedence: explicit owner + `AGENTS.md`; project orchestrator/AppSec/secure-verification; then pinned Cloudflare guidance. Project tenant/accounting/Hípico/privacy/release rules always win conflicts.

## Source of truth
Exact candidate source plus safely obtained runtime/config evidence. Deployment-only facts without evidence are `NEEDS_VALIDATION`, not confirmed vulnerabilities.

## Graphify probes
Use to map attack surfaces/trust boundaries and neighboring entry points. Graph conclusions are navigation evidence only.

## Inputs
Exact 40-char SHA, changed/reviewed surfaces, principal/input, intended control, available configuration/runtime evidence and existing finding fingerprints.

## Invariants
Audit auth/session/CSRF/throttling; tenant/RBAC/RLS/raw SQL; accounting; browser/PWA; files/import/export; CI/Vercel/secrets/supply chain; Hípico SOURCE/LAB/outbox; AI/tool injection; sensitive verticals; availability/backup. No neighboring subsystem inherits coverage automatically.

## Workflow
Classify each review unit `covered|candidate|needs_validation|deferred`. Confirm only when a lower-trust principal/input crosses an intended control to a concrete protected result with reproducible safe evidence. Deduplicate by root cause/fingerprint and propose smallest fix + regression.

## Negative tests
Tenant/BOLA, privilege escalation, injection, replay, formula/file abuse, webhook/tool injection, destination binding, secret/client exposure and retry/cost-amplification cases as applicable.

## Stop conditions
Unknown SHA, destructive validation requirement, missing evidence for a claimed confirmation, or conflict with a higher-authority ContaGest invariant.

## Verification
Use only `PASS|FAIL|BLOCKED|NOT_EXECUTED`; source review/build/queued CI/stale SHA never substitute for executed evidence.

## Output schema
For confirmed findings: priority/severity, fingerprint, files/routes, trust boundary, abuse path, preconditions, evidence, root cause, smallest fix, regression, acceptance, rollback/risk, dependencies and exact-SHA completion evidence.

## References
`AGENTS.md`, `contagest-appsec-review`, `contagest-secure-verification`, pinned Cloudflare skill in `agent-skills.lock.json`.
