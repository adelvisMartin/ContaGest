---
name: contagest-tenant-isolation-rbac
description: Mandatory isolation and authorization gate for multiempresa routes, queries, exports, jobs, caches and agent tools.
contractVersion: 2
---

# ContaGest Tenant Isolation & RBAC

## Trigger
Whenever code reads/writes tenant data, changes auth/session/RBAC/licensing, adds endpoint/export/import/job, changes cache/storage keys or exposes an AI/tool action.

## Non-trigger
Do not treat UI visibility, client `tenantId`/RIF/role/permission or URL/storage state as authorization authority.

## Authority
Authenticated server context and backend policy/RLS determine tenant/account/user/role; project tenant policy outranks client state and external skill advice.

## Source of truth
Auth/session middleware, RBAC/domain policy, tenant-scoped services/queries, RLS/constraints and negative integration tests.

## Graphify probes
Use to trace route→middleware→service→query/cache/export/job ownership and locate potentially unscoped access.

## Inputs
Principal, tenant/account membership, role/permissions, resource/action, entitlement/license state, direct/list/search/export paths and exact SHA.

## Invariants
Tenant A cannot read/infer/update/delete/export/enumerate B; tenant role cannot bind platform permissions; UI is convenience only; entitlement/license/RBAC are separate checks; cache/PWA/export/jobs are tenant-scoped; same email does not merge tenant memberships; RIF correction is controlled, not ordinary CRUD.

## Workflow
Trace route→middleware→service→query→DB/RLS. Review unscoped reads/writes, mass assignment, arbitrary permission keys and client-controlled tenant predicates. Execute complete tenant/role matrix.

## Negative tests
`A→A allowed`, `A→B denied`, `B→A denied`, unauthenticated denied, underprivileged denied, suspended/expired denied when relevant; test direct IDs plus list/search/export/enumeration.

## Stop conditions
Tenant escape, permission self-grant, platform escalation, UI-only authorization or cross-tenant cache/export => P0/P1 and `BLOCK_MAIN=yes`.

## Verification
Execute backend/DB/API negative tenant tests and relevant browser access-denied paths on exact SHA.

## Output schema
`STATUS`; abuse path; evidence; policy owner; regression matrix; residual risk; `BLOCK_MAIN=yes|no`.

## References
`AGENTS.md`, `contagest-appsec-review`, `contagest-db-migration-safety`, `contagest-release-evidence`.
