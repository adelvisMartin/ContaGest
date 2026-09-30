# Auth bootstrap authority — issue #844

`SOURCE_REUSE=NONE`

## Purpose

ContaGest has two different trust phases during authentication:

1. **Bootstrap identity**: the backend does not yet have a tenant-scoped database context and must resolve only enough server-side identity to establish one.
2. **Tenant runtime**: after a signed/backend or database-resolved tenant identity exists, normal tenant data access runs through `runWithRuntimeTenant` from #843, which binds `contagest.tenant_id` transaction-locally for Prisma.

This ticket deliberately does **not** perform the RLS policy cutover. #845 owns the forward-only tenant policy migration and runtime-role rollout; #846 owns the two-tenant/pool rollback adversarial closure gate.

## Trust boundaries

### Backend JWT

`verifyAccessToken()` validates signature, algorithm, issuer, audience, expiry and ContaGest authority claims before `tenantId` is used to enter runtime tenant context. A modified tenant claim therefore invalidates the token rather than selecting another tenant.

After verification, ContaGest enters `runWithRuntimeTenant(decoded.tenantId)` and revalidates the active `UserProfile`. Cookie-backed access additionally requires a signed `sid` and revalidates the matching active, unexpired `UserSession` in the same tenant.

The request middleware keeps the verified tenant AsyncLocalStorage context active while downstream Express middleware/handlers are invoked, so Prisma operations created downstream inherit the server-derived tenant identity.

### Login by RIF + email

`private.contagest_bootstrap_login_identity(text,text)` is the only pre-context tenant lookup used by `/auth/login`. It accepts the presented RIF/email pair and returns exactly:

- `tenant_id`;
- `user_profile_id`;
- `password_hash`.

It does not list tenants, does not accept `tenantId`, and does not return profile/tenant metadata. Password verification occurs against the returned hash (or the existing dummy bcrypt hash when no identity resolves). A successful password is still insufficient: the backend then enters the returned tenant context and revalidates the same active profile and current password hash before license/MFA/session work.

### Supabase fallback

Supabase remains opt-in. The provider token is first verified through `supabase.auth.getUser(token)`. Only the verified provider `user.id` is passed to `private.contagest_bootstrap_supabase_identity(text)`.

The function returns only the matching active ContaGest `tenant_id` + `user_profile_id`, requires an active profile and active tenant, and exposes no tenant selector. The backend then enters that tenant context and revalidates the exact profile including `authUserId` equality before the request receives ContaGest context.

### First-tenant registration

`private.contagest_bootstrap_register_tenant(...)` performs the unavoidable pre-context write as one PostgreSQL function invocation. It creates:

- Tenant;
- first active UserProfile;
- canonical administrator permissions/role assignments;
- AccountUser;
- TenantMembership.

The function normalizes RIF/email, takes a transaction-scoped advisory lock for the normalized RIF, and maps uniqueness races to `CONTAGEST_BOOTSTRAP_REGISTRATION_CONFLICT`. PostgreSQL statement/function atomicity prevents partial tenant/admin graphs; retry/conflict tests assert that only one tenant remains. The backend then re-enters normal tenant context before materializing the administrative session.

No bootstrap function requires or grants `BYPASSRLS`.

## Database security contract

All three functions are in schema `private` and are:

- `SECURITY DEFINER`;
- owned by the safe migration owner `postgres`;
- declared with `SET search_path = pg_catalog`;
- fully schema-qualified for application objects;
- revoked from `PUBLIC`;
- revoked from `anon`, `authenticated` and `service_role` when those roles exist;
- granted only `EXECUTE` to `contagest_runtime` when that runtime role already exists.

`contagest_runtime` also receives only `USAGE` on `private` needed to invoke the functions. The migration does not create a login role or credentials. When #845 provisions/cuts over the runtime role after #844 has already been migrated, that rollout must ensure these three EXECUTE grants are present before switching the application connection role.

The isolated PostgreSQL 17 gate asserts `contagest_runtime` is `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOBYPASSRLS` and that `PUBLIC`/browser roles cannot execute the bootstrap functions.

## Existing identity-plane operations outside this ticket

Multi-company membership discovery/switching and refresh/logout session-token rotation already have separate cross-tenant/global identity semantics. #844 does not widen them or create a generic bypass. Current-tenant profile/session/license/MFA work touched by this ticket is tenant scoped; broader session/token hardening remains coordinated by #851.

## Verification

The ticket-specific commands are:

```bash
npm --workspace backend run test:auth-bootstrap:postgres
npm --workspace backend run test:auth-bootstrap:unit
npm --workspace backend run test:runtime-tenant-context
npm --workspace backend run typecheck
npm --workspace backend run build
npm --workspace backend run migration:test:from-zero
npm --workspace backend run migration:test:upgrade
npm run audit:database-authority
npm run audit:raw-sql-security
npm run agent:gates -- --base main --type backend
```

The PostgreSQL gate refuses to run unless `DATABASE_URL` names an isolated database containing `v844`, `ephemeral`, or `test`. The repository workflow supplies PostgreSQL 17 `contagest_v844`; production/Supabase is never reset or mutated for this QA.

## Rollout order

1. Merge/deploy #844 schema + backend while existing production authority remains compatible.
2. Provision/verify `contagest_runtime` grants and perform fail-closed RLS policy cutover in #845.
3. Run #846 against isolated PostgreSQL 17 with two tenants, rollback/error and connection reuse.
4. Only then close the parent runtime tenant-context work when exact-SHA evidence is complete.
