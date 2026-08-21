---
name: contagest-tenant-isolation-rbac
description: Mandatory isolation and authorization gate for multiempresa routes, queries, exports, jobs, caches and agent tools.
---

# ContaGest Tenant Isolation & RBAC

## Trigger
Use whenever code reads/writes tenant data, changes auth/session/RBAC/licensing, adds an endpoint/export/import/background job, changes cache/storage keys or exposes an AI/tool action.

## Authority model
Authenticated server context determines tenant/account/user/role. `tenantId`, RIF, role, plan or permission supplied by browser/query/body is never authorization authority.

## Invariants
- Tenant A cannot read, infer, update, delete, export or enumerate Tenant B.
- Tenant role cannot grant or bind platform-scoped permissions.
- UI visibility is convenience only; backend policy/RLS is authoritative.
- Subscription entitlement, license state and RBAC permission are separate checks.
- Cache, PWA storage, export artifacts and background jobs are tenant-scoped.
- Same email across tenants does not silently merge identities/memberships.
- RIF correction uses controlled workflow, not ordinary CRUD.

## Required regression matrix
For every resource or mutation: `A→A allowed`, `A→B denied`, `B→A denied`, unauthenticated denied, underprivileged role denied, suspended/expired entitlement denied when applicable. Test direct IDs and list/search/export paths to prevent IDOR and enumeration.

## Review
Trace route → middleware → service → query → DB constraint/RLS. Search for unscoped `findUnique/findMany/update/delete`, mass assignment, arbitrary permission keys and client-controlled tenant predicates.

## Stop conditions
Any tenant escape, permission self-grant, platform escalation, UI-only authorization or cross-tenant cache/export is P0/P1 and `BLOCK_MAIN=yes`.

## Output
Return status, abuse path, evidence, exact policy owner, regression tests, residual risk and block decision.
