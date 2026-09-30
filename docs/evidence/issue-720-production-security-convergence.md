# #720 Production Security Convergence — exact-SHA evidence

Date: 2026-09-30
Repository baseline: `main@3a278d0a321ab3e00fd090aeb9d1f82ebec17eeb`
#635 source merge: PR #735 / merge `66a4130b6472eea824f675ef2b4a1e9b66e34718`
Current runtime-RLS authority consumed: #845 and the current `ops/database/provision-security-roles.sql` / `runtime-rls-policy-v845.sql` on the baseline above.
Production project: Supabase project ref only; connection URLs, passwords, JWTs, user data and tenant identifiers are intentionally omitted.

## Scope decision

#720 is an operational convergence ticket. Production was audited read-only before any DDL decision. The catalog already contains the post-#635/#845 state, so reapplying 0003/0004 or the runtime policy sidecar would add operational risk without changing the converged state. No production DDL or business-row mutation was performed by this execution.

The repository still classifies `0002 -> 0003 -> 0004` as policy authority, while #845 is the forward-only runtime RLS authority that removes the superseded all-tenant runtime policy. Hípico/BudgetWallet objects were not changed.

## Production catalog evidence

Observed server: PostgreSQL 17.6.

Dedicated roles:

- `contagest_runtime`: LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS.
- `contagest_backup`: same least-privilege role attributes.
- `contagest_monitor`: same least-privilege role attributes.
- runtime has no CREATE on `public` or `private`.
- runtime is not a member of `service_role`.
- runtime owns no tables/relations or functions in `public`/`private`.
- backup can read `AuditLog` and cannot INSERT/UPDATE/DELETE it.
- monitor snapshot exists, supports SELECT/INSERT/UPDATE and denies DELETE.

RLS / grants:

- application tables inspected: 104.
- tenant tables with RLS disabled: 0.
- tenant tables exposing direct anon/authenticated SELECT/INSERT/UPDATE/DELETE: 0.
- the 14 #635 stale-grant tables: 14/14 have anon=false and authenticated=false for SELECT/INSERT/UPDATE/DELETE.
- `contagest_runtime_backend_all` present: false.
- tenant-owned runtime policies with unconditional `true`: 0.
- direct tenant tables missing `contagest_runtime_tenant_scope`: 0.
- child tenant tables detected: 9; missing `contagest_runtime_parent_scope`: 0.
- runtime SELECT access to lower_snake_case shared-product tables: 0.

Functions / helpers:

- `private.contagest_runtime_tenant_id()` exists, is runtime-executable and fixes `search_path=pg_catalog`.
- ContaGest SECURITY DEFINER functions in audited scope with unsafe search path: 0.
- ContaGest SECURITY DEFINER functions with PUBLIC EXECUTE: 0.
- ContaGest SECURITY DEFINER functions with anon EXECUTE: 0.
- public `current_tenant_id()` / `current_profile_id()` are SECURITY INVOKER compatibility wrappers; private resolvers are controlled SECURITY DEFINER functions with `search_path=pg_catalog`.

Result: **production database security catalog CONVERGED** for the #720/#635/#845 scope.

## Runtime/backend smoke

`SET ROLE contagest_runtime` from the Supabase management SQL session was rejected because the managed `postgres` session is not a member of `contagest_runtime`. This is consistent with separation of owner/runtime authority. A proposed temporary membership inside a rolled-back transaction was not executed because the connected tool safety boundary blocks role-membership mutation.

The exact `main` production deployment visible in Vercel is currently `ERROR` with provider metadata `BUILD_UTILS_SPAWN_103` / build command exit 103. Therefore an HTTP backend smoke using the deployed application and its actual runtime DSN cannot be represented as PASS in this evidence.

Classification: `BLOCKED_PROVIDER_RUNTIME` / `NOT_EXECUTED` for the deployed backend smoke only. Database catalog convergence is independently verified and does not depend on that provider execution.

## Reproducible gate

`ops/database/verify-production-security-convergence-v720.sql` is a read-only fail-closed catalog verifier for the state above. It checks roles, schema CREATE, service-role inheritance, ownership, runtime all-tenant policies, tenant/child policies, the 14 stale grants and ContaGest SECURITY DEFINER search paths without reading business rows.

## Security / data handling

- no credentials, passwords, database URLs, JWTs, recovery links, PII or tenant IDs are recorded;
- no Hípico/BudgetWallet object was mutated;
- no production business row was changed;
- infrastructure cost added by this ticket: $0.

## Status by acceptance criterion

- exact source/main SHA fixed: VERIFIED.
- dedicated roles present/minimal: VERIFIED.
- 0003/0004 catalog outcome present: VERIFIED; no redundant reapply performed.
- 14/14 stale grants removed: VERIFIED.
- helpers/function ACL/search_path converged: VERIFIED.
- v635-equivalent P0/P1 catalog findings in ContaGest scope: 0, VERIFIED.
- Hípico/BudgetWallet untouched: VERIFIED for this execution.
- backend connected with `contagest_runtime` / HTTP smoke: NOT VERIFIED — provider deployment is ERROR and direct-role smoke is unavailable through the connected management session.
- evidence redaction: VERIFIED.
