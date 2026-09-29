# ContaGest Auth Boundary v636

Issue: #636.

## Authorities

ContaGest has two possible identity verifiers, but a presented token is routed to exactly one of them before cryptographic verification:

- `backend-jwt` is the default and canonical session authority for ContaGest-issued access tokens and browser cookies.
- `supabase` is a compatibility bridge only when `SUPABASE_AUTH_FALLBACK=true` is explicitly configured together with `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

`backend/src/shared/auth/authBoundary.ts` performs routing only. It never authenticates an untrusted token. `verifyAccessToken()` remains the cryptographic verifier for ContaGest tokens; `supabase.auth.getUser()` is the verifier for bridge tokens.

A token carrying ContaGest authority signals (`iss=contagest-api`, `authMode=backend-jwt` or `tokenType=access`) is never retried against Supabase after a signature/claim failure. This removes verifier fallback ambiguity and closes a confused-deputy class of behavior.

## Backend JWT contract

Access JWTs are pinned to:

- algorithm: `HS256`;
- issuer: `contagest-api`;
- audience: `contagest-web`;
- short TTL: 15 minutes;
- `sub`, `tenantId`, `email`, `authMode=backend-jwt`, `tokenType=access`;
- optional `sid` tying browser-cookie access to a server session.

The JWT's tenant/role/permissions are not sufficient authorization. Request context reloads the active `UserProfile` under `(sub, tenantId)`, and permission checks query current tenant-scoped roles/permissions server-side.

## Browser session and revocation

Browser sessions use HttpOnly access/refresh cookies plus a CSRF token. `UserSession` is authoritative for cookie-session lifecycle:

- access cookie requires a live server `sid`;
- refresh tokens are stored as HMAC hashes, not plaintext;
- every refresh rotates refresh + CSRF material with a compare-and-swap update;
- concurrent/reused refresh revokes the session;
- disabled/expired users revoke or fail the session;
- logout revokes the active refresh session and clears cookies;
- mutating cookie requests require CSRF cookie/header/session agreement.

Bearer backend JWTs are short-lived credentials. Even without a browser `sid`, each request reloads current active user/tenant state, so a disabled account fails immediately. Session-specific browser revocation remains tied to `sid`.

## Supabase bridge

The bridge is off by default. When enabled:

1. a token that does not claim ContaGest authority is routed to Supabase;
2. provider verification must return a Supabase user;
3. ContaGest then resolves `UserProfile` by server-side `authUserId` with `status=active`;
4. tenant, license, RBAC and platform permission decisions remain ContaGest server-side authorities.

Missing provider configuration while the bridge is explicitly enabled fails closed. Invalid external credentials return a generic authentication failure; foreign tenant/permission data is never accepted from token payloads or client request bodies.

## Status contract

- `401`: absent, invalid, expired, bad signature/issuer/audience, revoked/replaced browser session, invalid external credential.
- `403`: cryptographically valid identity that lacks an active profile, has expired temporary access, fails CSRF, license, RBAC or platform authorization.
- `503`: explicitly enabled external identity bridge is misconfigured/unavailable before verification can be attempted safely.

## Verification

Backend suite:

```bash
npm --workspace backend test
npm --workspace backend run typecheck
```

Focused static contract:

```bash
node --test tests/auth_boundary_issue_636.test.mjs
```

Provider-specific network behavior that cannot be reproduced locally must be marked `BLOCKED_EXTERNAL_PROVIDER`; hosted CI with no runner/steps is `BLOCKED_INFRASTRUCTURE/NOT_EXECUTED`, never PASS.
