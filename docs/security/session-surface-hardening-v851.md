# #851 Session Surface Hardening — characterization and authority matrix

Baseline authority: #636 remains canonical for Auth/Session. This document records the #851 follow-up evidence only; it does not define a second identity or session system.

## Evidence-based ownership

| Credential / lifecycle | Owner | Evidence / rule |
| --- | --- | --- |
| ContaGest browser access JWT | ContaGest backend | Signed by `shared/auth/jwt.ts`, bound to `UserSession.sid`, exact issuer/audience/purpose and server revalidation. |
| ContaGest browser refresh secret | ContaGest backend | Opaque random `cgr_*`; only an HMAC hash is persisted. Rotation and family reuse handling live in `sessionCookies.ts`. |
| Browser CSRF secret | ContaGest backend | Double-submit cookie/header pair; only an HMAC hash is persisted in the server session. |
| Supabase access token | Supabase | Accepted only through the opt-in bearer bridge; Supabase proves provider identity and #844 resolves the tenant/profile server-side. ContaGest does not persist or rotate a second Supabase refresh secret. |
| Device credential | ContaGest backend | Separate strict, HttpOnly device cookie; it is not an ERP access/refresh token. |

## Browser storage and transport

- ERP access and refresh credentials are server-managed cookies. JavaScript does not receive either raw credential.
- The CSRF cookie is intentionally readable so the browser can echo it in `x-csrf-token`; unsafe cookie-authenticated requests must match both cookie and header and the active server session hash.
- Frontend `localStorage` stores non-secret session metadata only. The legacy token field is discarded and the client does not synthesize a bearer `Authorization` header for the normal ERP flow.
- The frontend uses `credentials: include`, refresh single-flight per tab, and clears tenant-scoped store/offline state on tenant switch/logout.

## Cookie contract

Production topology currently uses same-host browser cookies and does not require a parent-domain cookie. Therefore the server-managed credential cookies use the `__Host-` prefix, `Secure`, `Path=/`, no `Domain`, explicit `SameSite`, and `HttpOnly` whenever JavaScript does not need the value. The CSRF cookie is the intentional exception to `HttpOnly`.

Emission and deletion use the same canonical option source (`sessionCookieContract`), so Path/SameSite/Secure/HttpOnly do not drift between `res.cookie` and `res.clearCookie`.

A future cross-subdomain topology is OUT OF SCOPE for #851. It must not weaken the existing host-only contract without a separate threat model and migration plan.

## Session fixation and privilege transitions

- Successful password or coordinate-MFA login calls `issueBrowserSession`, which creates a new random server session id plus fresh refresh/CSRF credentials. A pre-auth challenge is never reused as the privileged browser session.
- Tenant switch is server-resolved through membership authority, revokes the previous browser session, creates a fresh session for the destination tenant, and the frontend purges prior tenant caches/offline scope.
- Roles/permissions and active-user state are revalidated server-side; the browser cannot widen tenant/role by mutating local metadata.
- Logout, disabled users, expired access and explicit session revocation invalidate access because every backend JWT is bound to an active `UserSession.sid`.

## Refresh rotation / reuse semantics

ContaGest is the owner of the browser refresh lifecycle, so #851 adds family lineage without storing raw secrets:

1. A successful rotation CAS-updates the current `UserSession` only when refresh hash, CSRF hash and status still match.
2. In the same transaction, the consumed refresh/CSRF HMAC hashes, rotation counter and original expiry are inserted into `UserSessionRefreshReuse`.
3. A later presentation of an unexpired consumed refresh resolves to the same session family as `refresh_state=reused`.
4. The historical CSRF pair must also match before reuse is acted on; possession of only a stale refresh secret cannot be used as a family-revocation DoS primitive.
5. Valid reuse revokes the active session family. A concurrent refresh that loses the CAS also revokes the family deterministically.
6. Logout can resolve either the current or a consumed refresh and revoke the same family.
7. Historical rows contain hashes only, are tenant-isolated with RLS for the runtime role, and cascade with `UserSession`.

Supabase refresh remains provider-owned and is not duplicated by this implementation.

## Credential × surface × namespace matrix

Only surfaces present in ContaGest are listed.

| Credential purpose | Transport | Real surface / namespace | Expected result |
| --- | --- | --- | --- |
| ContaGest access JWT, valid cookie | Host-only access cookie | Same-host ERP `/api/v1/*` | Route-specific success when authorization allows; server session must still be active. |
| ContaGest access JWT, wrong signature/issuer/audience/purpose/expiry | Cookie or bearer | `/api/v1/*` | `401` fail-closed. It must not verifier-hop to Supabase. |
| ContaGest access JWT, active identity but insufficient permission | Cookie or bearer | Protected `/api/v1/*` operation that exists | `403`. |
| App-owned refresh, current + matching CSRF | Host-only refresh + CSRF cookie/header | `/api/v1/auth/refresh` | `200` and rotation when user/session remain active. |
| App-owned refresh, consumed + matching historical CSRF | Host-only refresh + CSRF cookie/header | `/api/v1/auth/refresh` | `401`; active family revoked. |
| App-owned refresh, concurrent loser | Host-only refresh + CSRF cookie/header | `/api/v1/auth/refresh` | `401`; final family state revoked. |
| Cookie-authenticated unsafe request without matching CSRF | Cookie + missing/mismatched header | Unsafe `/api/v1/*` mutation | `403`. |
| Supabase access token, bridge disabled | Bearer | `/api/v1/*` | `401`; no external verifier fallback. |
| Supabase access token, bridge enabled and valid | Bearer | `/api/v1/*` | Provider identity is verified, then #844 resolves tenant/profile server-side; route authorization still applies. |
| Supabase provider unavailable / bridge misconfigured | Bearer | `/api/v1/*` | Fail-closed (`401` invalid/unverifiable or `503` explicit bridge misconfiguration), never anonymous success. |
| Device credential | Host-only strict device cookie | License/device validation path | Device/licensing purpose only; it is not accepted as ERP access JWT or refresh. |
| No credential | none | Public/stateless route that is intentionally public | Route-specific public response. |
| No credential | none | Existing protected operation | `401`. |
| Any credential | any | Operation deliberately absent from a build/surface | `404` by physical absence; #850 remains authority for public contract projection. |

## CSRF, CORS and recovery boundary

- SameSite is defense-in-depth, not the sole CSRF control. Unsafe cookie-authenticated mutations require the double-submit token tied to the active server session.
- CORS/origin policy does not create an authenticated principal; identity still comes from the verified credential and server-derived tenant/profile.
- Authentication/recovery secrets must not be placed in query strings, URL fragments, structured logs, telemetry fields or artifacts. #650 remains the observability authority.

## Observability and revocation runbook

Safe audit fields may include event type, correlation/request id, server session id, user/profile id, tenant id, rotation counter, reason and timestamps. Never record raw JWTs, Cookie headers, refresh/CSRF/device credentials, password/reset/recovery secrets, or full authorization headers.

For a security event involving a ContaGest browser session:

1. Resolve the trusted server-side `UserSession.id` from the authenticated/reuse path; do not paste the credential into logs or tickets.
2. Mark the server session revoked (`status=revoked`, `revokedAt`) in the tenant runtime context. Session-bound access JWTs then fail revalidation.
3. For refresh reuse, revoke the family and clear browser cookies. Retain only the HMAC lineage needed to recognize already-consumed credentials until their original expiry.
4. For user disable/security response, disable/revoke the authoritative profile/session state and validate that subsequent access and refresh fail closed.
5. Correlate through safe ids only. Key rotation/replacement follows #636/#650 authority and must not expose key material.

## #851 verification targets

- Unit: issuer/audience/expiry/purpose/tamper isolation plus production cookie contract.
- PostgreSQL ephemeral: current/reused refresh resolution, history RLS/grants, revoked family no longer resolves.
- Runtime/browser: login → reload/refresh → logout; tenant switch cache purge; disabled/revoked session denial; multi-tab concurrent refresh converges to revoked family on reuse/race.
- Canonical migration from-zero/upgrade and repository build gates remain required exact-SHA evidence when infrastructure executes them.
