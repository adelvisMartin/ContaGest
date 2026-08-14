# ContaGest-VE — Auth Security Benchmark v11.17

## Objective

Keep the existing ContaGest authentication flow and harden it incrementally. This document does **not** propose replacing the current login with Auth0, Google, Supabase Auth or Firebase Authentication. Those products are used as reference implementations for abuse protection, session management, MFA, token validation and app/device attestation.

## Current ContaGest baseline

The current backend already has a meaningful security foundation:

- passwords are hashed with bcrypt (cost 12);
- registration enforces 12–128 character passwords;
- login and registration use a signed, expiring CAPTCHA challenge;
- failed logins are recorded by tenant/email/IP;
- five failed credential attempts within the configured window disable the user until administrator intervention;
- authentication endpoints have a dedicated rate limiter in addition to the global API limiter;
- browser sessions use HttpOnly cookie-backed server sessions and the database session is checked for active/revoked/expired state;
- cookie mutations use double-submit CSRF protection;
- coordinate-card MFA is already integrated after the password stage;
- tenant, RBAC and commercial licensing checks remain server-side;
- production refuses to start sensitive flows without explicit JWT/license secrets.

Primary implementation references in this repository:

- `backend/src/modules/auth/auth.routes.ts`
- `backend/src/shared/middleware/security.ts`
- `backend/src/shared/auth/sessionCookies.ts`
- `backend/src/shared/auth/coordinateCard.ts`

## External benchmark: patterns worth adopting

### Auth0

Official references:

- https://auth0.com/docs/secure/attack-protection
- https://auth0.com/docs/secure/attack-protection/brute-force-protection

Patterns to retain/adopt:

1. **Layered attack protection**, not a single login counter: account-focused brute-force protection plus IP-velocity/bot controls.
2. Return `429` when traffic crosses an abuse threshold rather than allowing unbounded retries.
3. Monitor suspicious login activity independently from successful authentication.
4. Consider breached-password detection as a separate future control instead of embedding an external breach lookup directly into the login request path.

ContaGest status: account lockout, CAPTCHA and endpoint rate limits already cover the core pattern. Future work should improve security telemetry and IP/device risk signals rather than redesign the login screen.

### Supabase Auth

Official references:

- https://supabase.com/docs/guides/auth/rate-limits
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/auth/auth-mfa

Patterns to retain/adopt:

1. Rate-limit authentication operations separately from normal API traffic.
2. Maintain a server-verifiable session identifier and explicit session revocation/expiry controls.
3. Treat MFA as a second assurance stage, not merely another password field.
4. Define maximum and idle session lifetimes for privileged roles as a future policy layer.

ContaGest status: the first three are already substantially implemented. Session lifetime/reauth policy should be refined per role without invalidating existing sessions unexpectedly.

### Sign in with Google / Google Identity

Official references:

- https://developers.google.com/identity/siwg/best-practices
- https://developers.google.com/identity/sign-in/web/backend-auth

Patterns to adopt **if** Google identity is added later:

1. Use Google's official platform SDK/library instead of recreating OAuth UI or protocol handling.
2. Send an ID token to the backend over HTTPS and verify signature, issuer, audience and expiry server-side.
3. Use the verified `sub` claim as the stable external identity key; do not trust a client-supplied user ID or use email as the immutable identifier.
4. Keep authentication scopes separate from authorization to services such as Drive/Calendar.
5. Create platform-specific client IDs for Web/iOS/Android if native wrappers are introduced.

ContaGest status: Google sign-in is **not enabled by this phase**. The existing login remains authoritative.

### Firebase Authentication / App Check

Official references:

- https://firebase.google.com/docs/app-check
- https://firebase.google.com/docs/app-check/ios/app-attest-provider
- https://firebase.google.com/docs/app-check/web/custom-resource
- https://firebase.google.com/support/guides/security-checklist
- https://firebase.google.com/docs/auth/web/password-auth

Patterns to adopt selectively:

1. User authentication and app/device authenticity are different layers; neither replaces the other.
2. For a future native iOS shell, App Attest/DeviceCheck-style attestation can protect sensitive backend endpoints from unauthorized clients.
3. For the web/PWA channel, app-attestation enforcement must be rolled out in monitor/report mode first to avoid blocking legitimate browsers.
4. Password policy should be explicit and centrally enforced server-side.

ContaGest status: password policy already has a 12-character minimum. No Firebase dependency is introduced. App/device attestation is retained as a future optional defense layer for native/mobile distribution.

## Adopted phase-2 controls

- PWA and iOS interaction hardening without changing the login contract.
- One canonical typography system and safe-area/mobile touch targets.
- Dedicated CSP violation collector with independent rate limiting and bounded payloads.
- Strict CSP introduced in **Report-Only** mode before enforcement.
- Same-origin camera/geolocation permissions aligned with legitimate scanner/map ERP capabilities.
- Existing server-side input validation through Zod remains the source of truth.
- Existing authentication rate limiting, CAPTCHA, account lockout, CSRF and MFA remain enabled.

## Next hardening steps

1. Observe CSP reports and remove inline styles/unsafe DOM sinks module-by-module.
2. Add characterization tests around login/session/MFA before changing authentication policy.
3. Add explicit idle/maximum session policies for administrator/high-risk roles.
4. Add security-event telemetry for rate-limit, account-lock, MFA failure and suspicious-request events without storing credentials or sensitive request bodies.
5. Inventory privileged DOM sinks and evaluate Trusted Types in report/compatibility mode before any enforcement.
6. Consider compromised-password screening during password creation/reset, not as a blocking network dependency on every login.
7. If a native iOS wrapper is shipped later, evaluate platform attestation as a complementary control.

## Non-goals

- No authentication-provider migration in this refactor.
- No social login activation.
- No Firebase/Auth0/Supabase credential or SDK introduced into the frontend.
- No API secret is moved to browser code.
- No weakening of tenant/RBAC/license checks.
