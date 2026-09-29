# #634 Composite Tenant Referential Integrity — Implementation Plan

**Goal:** prevent cross-tenant references in critical tenant-owned relations using PostgreSQL composite referential guards where both sides persist tenant identity and service guards where child ownership is derived.

## Scope

- catalog/classification policy for tenant-sensitive references;
- forward-only composite FK/index migration;
- service-side validation for invoice-line products and fiscal period references;
- two-tenant regression contract;
- integration into the authoritative contract suite;
- exact-SHA documentation/evidence.

## Implementation sequence

1. Freeze current `main` and inspect duplicate work claims.
2. Characterize existing single-column tenant-owned FKs and classify each relation.
3. Establish RED regression on missing #634 contract.
4. Add policy + deterministic relation-set digest.
5. Add forward-only migration that fails closed on catalog drift and ambiguous historical data.
6. Add request-context service guard for references without child tenant ownership.
7. Add unit/contract regressions and register them in existing suites.
8. Execute PostgreSQL 17 isolated from-zero/upgrade and two-tenant negative verification through #632 + #634 gate.
9. Review diff/security, open PR, inspect exact-SHA provider status, merge only when material local gates pass.
10. Close #634 and update #624; split unrelated findings into follow-ups.

## Risks

- historical cross-tenant rows causing migration validation failure;
- duplicating existing FK lifecycle semantics;
- stale relation policy as schema evolves;
- service guard relying on client-provided tenant identity;
- merging a branch contaminated by parallel #619/#631 work.

## Controls

- exact relation count + digest before DDL;
- `NOT VALID` then `VALIDATE CONSTRAINT`, no row rewrite;
- composite guards use `NO ACTION`; existing FK stays lifecycle owner;
- authenticated request context is the tenant authority;
- clean branch created from the live `main`, copying only #634 artifacts;
- PG17 evidence is mandatory and may not be inferred from production metadata or static tests.
