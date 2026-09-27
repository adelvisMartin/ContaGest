---
name: contagest-appsec-review
description: Threat-driven AppSec review for ContaGest ERP, multi-tenant data, licensing and commercial controls.
contractVersion: 2
---

# ContaGest AppSec Review

## Trigger
Use for authentication/session, authorization, tenant data, licensing, exports/uploads, external inputs, sensitive verticals, supply chain and security-sensitive agent/tool changes.

## Non-trigger
Do not use to perform destructive production exploitation or to assign vulnerability severity without a demonstrated trust-boundary result.

## Authority
`AGENTS.md`, project AppSec/tenant contracts and owner instructions outrank external security guidance.

## Source of truth
Changed source/configuration, backend policy/RLS, project security tests and deployed evidence when a claim depends on runtime configuration.

## Graphify probes
Use to map trust boundaries, route→middleware→service→query paths and secret/provider ownership. Navigation output is not exploit evidence.

## Inputs
Exact SHA, changed paths, principal/input, protected resource/action, expected control and available runtime/config evidence.

## Invariants
Review authentication/session, IDOR/tenant escape, privilege escalation/mass assignment, RLS/raw SQL, secrets/logs, licensing, accounting authorization, subscription bypass, sensitive health data and backup/supply-chain blast radius.

## Workflow
1. Identify lower-trust principal/input and intended control.
2. Trace accepted path and authoritative enforcement.
3. Demonstrate the crossed boundary safely before calling a vulnerability confirmed.
4. Find root cause and smallest coherent fix.
5. Add regression coverage and re-check neighboring entry points.
6. Separate source facts from deployment-dependent `NEEDS_VALIDATION` facts.

## Negative tests
Cross-tenant IDs/list/search/export, permission self-grant, session reuse/revocation, mass assignment, injection/sink inputs, secret exposure and bypass of entitlement/security guards as applicable.

## Stop conditions
Critical/high exploitable finding, tenant escape, privilege self-grant, secret compromise path or required deployment evidence unavailable for a material claim.

## Verification
Run routed security/unit/API/tenant-negative/browser gates. Never infer PASS from source review, build or HTTP readiness alone.

## Output schema
Severity when confirmed; affected route/file; abuse path; precondition; evidence; root cause; smallest fix; regression; `BLOCK_MAIN=yes|no`; execution status.

## References
`AGENTS.md`, `contagest-tenant-isolation-rbac`, `contagest-secure-verification`, pinned external security guidance only as advisory input.
