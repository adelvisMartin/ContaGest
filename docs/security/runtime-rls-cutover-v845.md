# Runtime RLS cutover v845

`SOURCE_REUSE=NONE`

## Purpose

#845 removes the historical `contagest_runtime_backend_all USING(true) WITH CHECK(true)` policy from tenant-owned ContaGest tables and replaces it with transaction-scoped, fail-closed runtime RLS. It consumes #843 (`runWithRuntimeTenant` + transaction-local `set_config`) and #844 (narrow pre-tenant auth bootstrap).

No production destructive QA is part of this change. Historical migrations are not rewritten.

## Tenant authority

`private.contagest_runtime_tenant_id()` is the canonical PostgreSQL runtime helper. It reads `current_setting('contagest.tenant_id', true)`, canonicalizes it through PostgreSQL UUID parsing, verifies the tenant exists and is `active`/`trial`, and returns `NULL` for missing, malformed, suspended or stale context.

The helper is `SECURITY DEFINER`, owned by the database owner, fixes `search_path = pg_catalog`, is revoked from PUBLIC/browser/platform roles and is executable only by `contagest_runtime`. Runtime itself remains `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, `NOBYPASSRLS`, without schema CREATE or object ownership.

## Policy classes

### Direct tenant tables

Every PascalCase public table with a physical `tenantId` column is discovered from `pg_catalog` and gets `contagest_runtime_tenant_scope`. Customer runtime can only access rows whose `tenantId` equals the validated transaction context.

A small versioned platform catalog exists for objects used by the already-established `platform.manage` provisioning plane: `UserProfile`, `Role`, `TenantMembership`, `LicenseKey`, `LicenseActivation` and `SubscriptionTenant`. Only ContaGest's internal platform tenant (`rif = 00000000`) can use that additional path. Ordinary Tenant A/Tenant B contexts never satisfy it.

`Tenant` is the root object and is treated separately: customer runtime reads/updates only its own active/trial row; tenant creation remains #844 bootstrap authority. The internal platform tenant retains explicit administrative authority.

### Child tables

Tables without `tenantId` that reference one or more direct tenant tables inherit isolation from those parents. The sidecar derives FK predicates from `pg_constraint`; multiple tenant parents are ANDed, and nullable parent relations are checked only when populated. This protects lines/assignments such as invoice lines, ledger lines, payroll receipts, tax declarations, `RolePermission` and `UserRole` against relation pivots.

### Shared/global catalog

Shared objects are explicit rather than inferred:

- `Permission`: globally readable/writeable only while an active runtime tenant context exists; DELETE has no runtime policy.
- `AccountUser`: visible/updateable only through an active membership in the current tenant, with the explicit platform exception; insertion requires a valid current tenant.
- `AuthLoginAttempt`: deliberate pre-auth operational exception. SELECT/INSERT/DELETE are global because login throttling happens before tenant resolution. It contains no tenant-owned business rows and is versioned in the shared catalog.
- `Subscription`: readable by a tenant only when an active `SubscriptionTenant` link exists; writes are platform-only.
- `ModuleEntitlement`: readable only through a visible subscription; writes are platform-only.
- `CustomerAccount`, `SalesAgent`, `SubscriptionPayment`, `Commission`: platform-only.
- `SubscriptionTenant`: direct tenant policy plus explicit platform provisioning path.

Unknown PascalCase tables that have neither `tenantId`, a tenant-parent FK nor an explicit shared classification do not receive runtime access. Unknown non-RLS application tables have runtime privileges revoked.

## Multi-company identity

RLS is not opened merely because one human can belong to multiple companies. Two narrow private functions preserve the existing linked-account behavior:

- `private.contagest_runtime_list_accessible_tenants(source_profile_id)`
- `private.contagest_runtime_resolve_tenant_switch(source_profile_id, target_tenant_id)`

Both first prove that the source profile is active and belongs to the currently bound tenant, then traverse only memberships tied to the same active `AccountUser`. The backend re-enters each target tenant with `runWithRuntimeTenant` before checking platform access, license and subscription state. A browser-supplied target tenant is therefore never sufficient authority.

## Refresh/logout bootstrap

`UserSession` remains tenant-owned and does **not** receive an all-tenant policy. Refresh/logout must identify a session before its tenant GUC exists, so the forward-only migration `20260930023000_issue_845_runtime_session_bootstrap` adds one narrow `SECURITY DEFINER` lookup keyed only by the HMAC refresh hash:

`private.contagest_runtime_refresh_session_identity(refresh_hash)`

The function returns the single active session identity required to bind tenant context. All profile reads, session rotation and revocation then occur inside `runWithRuntimeTenant(session.tenantId)`. Broader session/fixation/reuse hardening remains owned by #851.

## Provisioning

`ops/database/provision-security-roles.sql` creates/rotates least-privilege roles, applies `ops/database/runtime-rls-policy-v845.sql`, grants runtime DML only to RLS-enabled application tables and restores narrow #844/#845 bootstrap EXECUTE grants when roles are provisioned after migrations.

`ops/database/verify-security-roles.sql` fails when:

- runtime role attributes are privileged;
- `contagest_runtime_backend_all` still exists;
- a tenant-owned runtime policy has unconditional `USING(true)`/`WITH CHECK(true)`;
- a direct tenant table lacks RLS/canonical policy;
- a child of a tenant table lacks parent-scoped policy;
- the helper ACL/search path is unsafe;
- missing/invalid/stale context resolves to a tenant;
- runtime reaches lower_snake_case shared-product tables.

The existing #635/#779 auditor remains an additional release-blocking check for `RUNTIME_ALL_TENANT_POLICY`.

## Isolated verification

Never run adversarial tests against production/Supabase data. The v845 PostgreSQL harness refuses databases whose names do not contain `v845`, `ephemeral` or `test` and requires PostgreSQL 17.

```bash
node --test tests/runtime_rls_policy_v845.test.mjs
npm --workspace backend run test:runtime-rls:postgres
npm --workspace backend run test:auth-bootstrap:unit
npm --workspace backend run test:runtime-tenant-context
npm --workspace backend run typecheck
npm --workspace backend run build
npm run audit:db-security:strict
npm run test:bootstrap:zero-cost
npm run agent:gates -- --base main --type backend
```

The PostgreSQL gate covers no-context/invalid/stale fail-closed behavior, A→A CRUD, A→B negative SELECT/INSERT/UPDATE/DELETE, child-parent isolation, transaction-local cleanup after commit/rollback, removal of the legacy policy and runtime role attributes. #846 expands this into the full connection-reuse/error/cancel/pool adversarial campaign.

## Rollout

1. Apply canonical migrations containing #844 and the #845 refresh-session bootstrap using the migration/owner credential.
2. On an isolated PostgreSQL 17 clone/ephemeral DB, provision roles and run `verify-security-roles.sql` plus v844/v845 gates.
3. Confirm #635/#779 auditor has no `RUNTIME_ALL_TENANT_POLICY` and exact candidate SHA evidence is recorded.
4. In production, apply migrations first, then run role/policy provisioning from a direct owner connection during a controlled maintenance window.
5. Run verification read-only/functional smoke using a dedicated non-production or explicitly safe runtime path before resuming full traffic.
6. #846 must complete two-tenant/pool evidence before #739 is considered closed.

## Rollback / incident response

Security rollback never recreates `contagest_runtime_backend_all` and never grants BYPASSRLS. If the cutover reveals an unclassified path:

1. stop/limit affected application traffic;
2. keep fail-closed RLS in place;
3. roll back the application release if needed, or disable the affected feature;
4. add the missing tenant/shared classification as a forward-only policy fix;
5. rerun isolated PG17 + verifier + #635 audit on the new SHA before reopening traffic.

This makes rollback operationally reversible without reintroducing the vulnerability that #739/#845 are designed to remove.
