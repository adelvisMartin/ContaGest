# Trusted Runtime Tenant Context — Design

`SOURCE_REUSE=NONE`

## Goal

Replace the `contagest_runtime` all-tenant RLS escape hatch with a server-derived, transaction-scoped tenant identity that remains safe under Prisma 6 and Supavisor/PgBouncer transaction pooling.

## Constraints

- The browser/body/query/header is never the tenant authority in production.
- Backend JWT tenant identity is accepted only after signature, issuer and audience verification and is then revalidated against server state.
- Supabase fallback and login/register are bootstrap operations and receive narrow authorities in #844; they do not justify global tenant DML.
- PostgreSQL context uses `set_config('contagest.tenant_id', tenantId, true)` so identity is local to one database transaction.
- No session-level tenant `SET`, no BYPASSRLS, no runtime object ownership, no runtime DDL.
- Existing Supavisor/PgBouncer runtime remains transaction mode.
- Production is never used for destructive QA.

## Delivery slices

1. **#843** — runtime context primitive and Prisma transaction binding. Does not change production policies.
2. **#844** — auth bootstrap authority: signed backend claims, narrow Supabase lookup, login/register bootstrap.
3. **#845** — forward-only runtime RLS cutover to tenant-aware policies.
4. **#846** — PostgreSQL 17 two-tenant/pool/rollback adversarial gate and closure evidence for #739/#635.

## Runtime model

`AsyncLocalStorage` carries only a canonical UUID tenant ID through backend async execution. It is not a database security boundary by itself. The Prisma proxy reads this server-side context and, for model/raw operations, opens a transaction, binds `contagest.tenant_id` transaction-locally and executes the operation on that same transaction client.

Existing interactive transactions are wrapped once: tenant binding occurs at transaction start and the application callback receives that exact transaction client. Sequential `$transaction([...])` is rejected while tenant context is active because its PrismaPromises are constructed before the wrapper can guarantee one tenant-bound connection; call sites must use the interactive callback form instead.

## Bootstrap boundary

Tenant-scoped RLS cannot be used to discover the tenant itself. #844 therefore owns deliberately narrow bootstrap functions. They return only the fields needed to verify an already presented identity or controlled login/register operation. SECURITY DEFINER helpers must use a closed `search_path`, be executable only by `contagest_runtime`, and never expose generic table access.

## PostgreSQL policy model

#845 introduces a private helper reading `current_setting('contagest.tenant_id', true)`. Missing/invalid settings resolve to no authorized tenant. Direct tenant tables compare `tenantId` to this helper; child tables derive tenant through their parent. Global/shared tables require an explicit reviewed catalog rather than a blanket exception.

## Evidence

#846 must prove A→A succeeds, A→B/B→A fail for SELECT/INSERT/UPDATE/DELETE, and connection reuse after commit/rollback/error never observes the previous tenant. Evidence is generated on PostgreSQL 17 isolated/ephemeral infrastructure and bound to the candidate SHA.
