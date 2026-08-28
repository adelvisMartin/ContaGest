# Control Hípico — Backend Authority (#116)

## Security objective

The PWA is an untrusted presentation client. Authentication proves who the user is; authorization and sensitive business rules remain server/PostgreSQL authority.

Production and pilot modes **fail closed** when an authoritative RPC is missing. Direct REST table fallback exists only for explicitly configured LAB environments and must never be inferred from a 404.

## Deployment modes

| Mode | Missing sensitive RPC | Direct table fallback |
| --- | --- | --- |
| `production` (default) | typed `HIPICO_RPC_REQUIRED` | forbidden |
| `pilot` | typed `HIPICO_RPC_REQUIRED` | forbidden |
| `lab` | typed error unless explicit flag | permitted only when `allowLabDirectTableFallback === true` |

Unknown/missing mode normalizes to `production`.

## Privileged role source

`sessionRole()` accepts privileged role only from `session.user.app_metadata.role`, which is server-managed in Supabase. `user_metadata` may still provide display-name UX but is never an authorization source.

The frontend `isAdmin` value is presentation only. Backend/RLS/RPC still validates every sensitive resource.

## Capability inventory

| Capability | Preferred production authority | LAB fallback |
| --- | --- | --- |
| profile read | `hipico_get_profile` RPC | owner-filtered `hipico_profiles` only when explicit LAB fallback is enabled |
| workspace read | `hipico_get_workspace` RPC | direct table only in explicit LAB |
| workspace mutation | `hipico_save_workspace` RPC | direct upsert only in explicit LAB |
| audit append | `hipico_append_audit` RPC | direct insert only in explicit LAB |
| recent shadow evaluation read | `hipico_recent_shadow_evaluations` RPC | direct SELECT only in explicit LAB |
| authentication | Supabase Auth endpoints | none |

Sensitive RPC absence in production is an operational/configuration error, not a reason to weaken authorization.

## RLS

Migration `20260827220500_hipico_backend_authority`:

- enables and forces RLS on Hípico profile/workspace/audit/shadow tables when present;
- adds **RESTRICTIVE** owner policies when an `owner_id` column and Supabase `auth.uid()` are available;
- creates the recent-shadow read RPC as `SECURITY INVOKER`;
- revokes PUBLIC execution and grants only the authenticated role when present;
- stores no service-role credential.

Restrictive policy is deliberate: it still constrains access if an older permissive policy exists.

## Negative authorization matrix

| Case | Expected result |
| --- | --- |
| user A reads workspace B | deny/no rows |
| user A writes workspace B | deny |
| user changes `user_metadata.role` to admin | remains non-admin |
| missing save-workspace RPC in production | `HIPICO_RPC_REQUIRED`, no table fallback |
| missing audit RPC in pilot | `HIPICO_RPC_REQUIRED`, no unaudited mutation |
| LAB without explicit fallback flag | fail closed |
| LAB with explicit fallback flag | legacy fallback allowed under RLS for migration/debug only |
| malformed/expired token | 401/auth failure; no anonymous privileged retry |
| service-role value bundled in PWA/APK | release-blocking finding |
| duplicate/replayed workspace write | authoritative RPC/version contract must reject or reconcile; client does not bypass through table fallback |

## Input/schema/rate limits

This PR does not move business authority into the PWA. The existing RPC/backend layer remains responsible for schema validation, idempotency, audit/correlation and rate limiting. Client-side validation is usability only.

Where a required authoritative RPC is absent, production stops that capability rather than reconstructing the rule in JavaScript.

## Verification

Run the repository contract:

```bash
node --test tests/hipico_backend_authority_issue_116.test.mjs
node scripts/hipico-backend-authority-audit-v116.mjs
```

A live Supabase verification must additionally execute the negative matrix with two isolated test identities/workspaces. Until a runner/test database actually executes that matrix, it is `NOT_EXECUTED/BLOCKED`, not PASS.

## Rollback

Frontend changes can be reverted normally. The migration is additive. Removing restrictive RLS policies should only occur after security review; do not disable RLS as a rollback shortcut. If rollback of the RPC is required, client production mode will safely return `HIPICO_RPC_REQUIRED` rather than falling back to sensitive tables.
