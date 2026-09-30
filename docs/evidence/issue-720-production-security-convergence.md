# #720 Production Security Convergence — evidence

Status captured: 2026-09-30 UTC.

## Source authorities

- Ticket: #720.
- #635 source authority: PR #735 merge `66a4130b6472eea824f675ef2b4a1e9b66e34718`.
- Runtime RLS authority: #845 (`ops/database/runtime-rls-policy-v845.sql`).
- #720 candidate branch started from `main@b581b9ca950563286e47df37f503b06d1e0d624e`.
- #762 route-manifest baseline prerequisite was repaired independently by PR #867 and merged as `3a278d0a321ab3e00fd090aeb9d1f82ebec17eeb`; it is not part of #720's DB/security diff.

## Production characterization before convergence

Target project: `soxzatxiwlfsvtblrqal` (PostgreSQL 17 managed by Supabase).

- `contagest_runtime`, `contagest_backup`, `contagest_monitor`: absent.
- #720 stale-grant target set: 14/14 tables present and directly readable/writable by both `anon` and `authenticated` through table ACLs.
- ContaGest SECURITY DEFINER functions in scope included non-canonical search paths and/or public execution grants.
- Production already contained a newer RLS policy set than historical `0002_rls_policies.sql`; replaying `0002` would remove newer policies. Therefore #720 did not replay that destructive historical cleanup. It converged the current policy state and applied the exact #635 forward sidecars `0003`/`0004`.
- One active customer tenant uses a bounded legacy TEXT primary key predating the current UUID default. No tenant id value is recorded in this evidence.

## Production convergence already applied by owner/migration identity

Applied transactionally through Supabase migration authority:

1. #635 `0003` + `0004` sidecar semantics.
2. Dedicated role provisioning with passwords generated inside PostgreSQL and stored only in Supabase Vault.
3. #845 runtime RLS helper/policy authority.
4. Least-privilege runtime/backup/monitor table and function grants.

Managed-provider constraint: Supabase's managed `postgres` role cannot delegate `pg_read_all_stats`. Monitoring therefore uses explicit ContaGest grants only; the runtime and backup contracts are unaffected.

## Verified catalog state

- Dedicated roles: 3/3 present with `LOGIN=true` and `SUPERUSER=false`, `CREATEDB=false`, `CREATEROLE=false`, `REPLICATION=false`, `BYPASSRLS=false`.
- `contagest_runtime`: no `CREATE` on `public` or `private`, no `service_role` membership, no `TRUNCATE`, no ownership of application tables/functions.
- Browser DML: 0 of 83 PascalCase tenant-aware tables grant direct SELECT/INSERT/UPDATE/DELETE to `anon` or `authenticated`.
- Ticket stale-grant set: 14/14 hardened.
- Tenant-aware RLS disabled: 0.
- Permissive `anon`/`authenticated` tenant policies with unconditional `true`: 0.
- Runtime access to lower-snake shared-product tables: 0.
- ContaGest SECURITY DEFINER functions in strict scope: unsafe search path = 0, PUBLIC EXECUTE = 0, anon EXECUTE = 0.
- Exposed non-`security_invoker` ContaGest views: 0.

## Shared-product non-mutation proof

Pre/post catalog hashes are identical:

- `hipico_*` / `budgetwallet_*` relations: `ed5d208e08767252c2521c1124d1be73` (22 objects).
- `hipico_*` / `budgetwallet_*` functions: `8553446198fa69285518e6f6e789c798` (28 objects).

No business row was modified as part of the convergence.

## Runtime compatibility finding

The first controlled runtime smoke exposed a real compatibility gap: #845 and the Node runtime context accepted only UUID-shaped tenant ids, while `Tenant.id` is a Prisma `String` and production has one active legacy customer id. The dedicated runtime failed closed for that tenant.

#720 fixes this without rewriting business PK/FK rows:

- modern canonical UUIDs remain accepted and normalized;
- UUID-shaped values with invalid version/variant remain rejected;
- bounded legacy `[A-Za-z0-9_-]` ids are accepted only as context syntax;
- database authority still requires an exact active/trial `Tenant` row;
- the compatibility helper is a forward-only sidecar applied after #845.

## Verification state for candidate

VERIFIED:

- focused Node 22 runtime-context regression: pass;
- Prisma schema validation on GitHub Actions: pass;
- TypeScript (`tsc --noEmit`) on GitHub Actions: pass;
- technical baseline: pass;
- DB security contract audit after managed-Supabase provisioning fix: pass;
- #635-equivalent production strict catalog checks listed above: pass.

PREEXISTING / OUT OF SCOPE:

- IAM platform-selector gate currently fails on main because the multi-company selector does not require both platform scope and the internal tenant. #720 does not change that selector.
- Control Hípico design-system authority currently fails on main for a stale generated CSS adapter and competing `--hc-*` owners. #720 does not change UI/CSS.

PENDING BEFORE #720 CAN BE CLOSED:

1. Merge PR #866 and pin its final merge SHA.
2. Apply `ops/database/runtime-tenant-id-compat-v720.sql` from that exact merge SHA.
3. Re-run customer-tenant runtime smoke: tenant resolution, tenant read, rolled-back tenant write, and non-destructive accounting read.
4. Rotate production backend connection to `contagest_runtime` and verify with the deployed runtime.

Provider blocker: current Vercel production deployments are in `ERROR`, and the available connector does not expose environment-variable mutation. `DATABASE_RUNTIME_URL` cutover and deployed backend smoke must remain `BLOCKED_INFRASTRUCTURE`/`NOT VERIFIED` until they can be executed; they are not represented as PASS.

No URLs, database passwords, JWTs, raw cookie/session values, PII, or tenant identifiers are recorded here.
