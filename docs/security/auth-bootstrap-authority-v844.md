# Auth bootstrap authority — issue #844

`SOURCE_REUSE=NONE`

## Purpose

ContaGest separates two trust phases during authentication:

1. **Bootstrap identity** — before a tenant DB context exists, the backend may resolve only the minimum server-side identity needed to establish one.
2. **Tenant runtime** — after a signed/backend or database-resolved tenant identity exists, normal database access runs through #843 `runWithRuntimeTenant`, which binds `contagest.tenant_id` transaction-locally for Prisma.

#844 does not perform the RLS cutover. #845 owns the forward-only runtime policy cutover and #846 owns the two-tenant/pool adversarial closure gate.

## Backend JWT boundary

`verifyAccessToken()` validates signature, algorithm, issuer, audience, expiry and ContaGest authority claims before the signed `tenantId` can influence database context. A modified tenant claim invalidates the token rather than selecting another tenant.

Every backend access token accepted by request/auth boundaries must be bound to a server-issued `sid`. After verification, ContaGest enters `runWithRuntimeTenant(decoded.tenantId)` and revalidates the matching active/unexpired `UserSession` (`sid + sub + tenantId`) plus the active `UserProfile` in the same tenant. Cookie transport retains the CSRF contract for state-changing requests; bearer transport does not bypass server-side revocation.

The request middleware invokes downstream Express middleware/handlers while AsyncLocalStorage contains that verified tenant, so Prisma calls inherit the server-derived authority.

## Login by RIF + email

`private.contagest_bootstrap_login_identity(text,text)` is the only pre-context tenant lookup used by `/auth/login`. It accepts the presented RIF/email pair and returns exactly `tenant_id`, `user_profile_id`, and `password_hash`; it does not accept a `tenantId` selector or enumerate tenants.

Password verification occurs against the returned hash (or the existing dummy bcrypt hash when no identity resolves). Success is still insufficient on its own: the backend enters the resolved tenant context and revalidates the same active profile/current password hash before license, MFA and session work.

## Coordinate-card MFA continuation

The coordinate challenge is an opaque server-issued UUID and remains the only client input needed by `/auth/login/coordinates`. `private.contagest_bootstrap_coordinate_challenge_identity(text)` resolves that exact challenge to only `tenant_id` and `user_profile_id`; it does not accept a tenant selector and does not expose card hashes, answers or challenge context.

`verifyCoordinateChallenge()` immediately enters `runWithRuntimeTenant` with that server-resolved tenant before reading or mutating `CoordinateChallenge`/`CoordinateCard`. Every challenge/card query is re-constrained by `challengeId + tenantId + userId`, including expiration, failed-attempt and success mutations. This keeps the second MFA step compatible with #845 fail-closed tenant policies without changing the public request contract.

## Supabase fallback

The bridge remains opt-in. The provider token is first verified using `supabase.auth.getUser(token)`. Only that verified provider `user.id` reaches `private.contagest_bootstrap_supabase_identity(text)`. The function returns only the matching active ContaGest tenant/profile identity, and the backend re-enters tenant context and revalidates exact `authUserId` equality before exposing ContaGest context.

## First-tenant registration

`private.contagest_bootstrap_register_tenant(...)` performs the unavoidable pre-context write as one PostgreSQL invocation. It creates the Tenant, first active UserProfile, canonical administrator role/permissions, distinct AccountUser identity and TenantMembership.

The function normalizes RIF/email, takes a transaction-scoped advisory lock keyed by normalized RIF and maps uniqueness races to `CONTAGEST_BOOTSTRAP_REGISTRATION_CONFLICT`. PostgreSQL function/statement atomicity prevents partial tenant/admin graphs and repeated/conflicting submissions cannot create duplicate tenant graphs. Equal email text in two independent tenant registrations deliberately creates distinct `AccountUser` rows because email equality does not prove cross-tenant identity linkage.

After creation, the backend enters the new tenant context before materializing the administrative session. No bootstrap function requires or grants `BYPASSRLS`.

## Database security contract

All bootstrap functions live in `private` and are `SECURITY DEFINER`, use `SET search_path = pg_catalog`, fully qualify application objects, are revoked from `PUBLIC`, and revoke EXECUTE from `anon`, `authenticated` and `service_role` when those roles exist. EXECUTE is granted only to an already-provisioned `contagest_runtime`; the migrations never create login credentials or widen runtime role attributes.

The PostgreSQL gates assert runtime stays `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOBYPASSRLS`, browser/public roles cannot execute bootstrap functions, the opaque MFA challenge resolves only its own tenant/profile pair, and direct table access is not required for that pre-context lookup.

## Shared identity operations

Multi-company membership discovery/switching has cross-tenant identity semantics and is not converted into a blanket exception here. #845 must keep shared/global objects explicit and #846 must prove no cross-tenant bypass through connection reuse or identity-plane paths. Broader session hardening remains coordinated by #851.

## Verification

Use the existing local/canonical infrastructure rather than a ticket-specific workflow:

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

The PostgreSQL gate runs both the login/Supabase/registration harness and the coordinate-MFA bootstrap harness. Both refuse to run unless `DATABASE_URL` names an isolated database containing `v844`, `ephemeral`, or `test`. Production/Supabase must never be reset or used for destructive/adversarial QA. If the current executor has no PG17/container runtime, the PostgreSQL evidence is `BLOCKED_INFRASTRUCTURE/NOT_EXECUTED`, not PASS.

## Rollout order

1. Integrate #844 bootstrap schema/backend while existing runtime policy remains compatible.
2. #845 provisions/verifies the runtime role and cuts tenant-owned tables to fail-closed tenant-aware RLS.
3. #846 executes PostgreSQL 17 A↔B, rollback/error and connection-reuse evidence.
4. Close #739 only when that exact-SHA evidence is complete.
