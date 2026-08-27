# Auth throttle — Issue #89

## Purpose

This document is the operational and security specification for password-login throttling in ContaGest VE after issue #89. It separates two concepts that must never be conflated:

- `UserProfile.status = disabled`: explicit administrative account state.
- authentication throttle: temporary, automatically expiring defensive state derived from recent login attempts.

A failed password request MUST NOT write `disabled` or otherwise reactivate/deactivate an account.

## Threat model

### Protected abuse cases

- brute-force password guessing against one account;
- credential stuffing distributed over multiple source IPs;
- attempts to bypass counters by changing RIF/email casing or surrounding whitespace;
- targeted account-lockout denial of service;
- account enumeration through different login status codes/messages;
- concurrent failed requests racing around the threshold;
- accidental credential/token disclosure in authentication telemetry.

### Defense in depth

The account throttle does not replace existing controls:

1. the signed, expiring CAPTCHA is verified before the account throttle;
2. `authRateLimit` remains mounted on `/api/v1/auth` in addition to the global rate limit;
3. the throttle identity is normalized `tenant RIF + email`, while `AuthLoginAttempt.ipAddress` remains a supplementary signal;
4. coordinate-card MFA remains a later authentication stage;
5. licensing, RBAC and tenant checks remain server-side.

OWASP Authentication Cheat Sheet is the policy reference for the architecture: failed-login counters should be account-associated rather than IP-only, lockout design must balance threshold/window/duration, CAPTCHA is defense in depth, and account lockout must be designed so it cannot become an easy denial-of-service mechanism.

Reference: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html

## Throttle model

`AuthLoginAttempt` remains append-only evidence during its retention period. No schema migration is required for #89.

The throttle is replayed from a bounded attempt stream:

- failed attempt: `success=false`;
- successful credential validation: `success=true` and acts as a logical reset boundary;
- blocked/throttled requests are not inserted as additional failures, so repeatedly hitting a locked identity cannot extend the lock;
- failures already in flight when another request reaches the threshold can still be persisted, but the state machine ignores them for lock extension;
- after expiry, the first new failure starts a fresh observation window.

This design avoids a mutable read-modify-write lock counter and therefore avoids lost updates under concurrent requests while keeping historical attempts available for security analysis.

## Default policy

The defaults are deployment policy, **not** OWASP-mandated constants:

| Setting | Default | Meaning |
| --- | ---: | --- |
| `AUTH_LOGIN_FAILURE_LIMIT` | `5` | failures required to activate the account throttle |
| `AUTH_LOGIN_OBSERVATION_WINDOW_SECONDS` | `900` | 15-minute rolling failure window |
| `AUTH_LOGIN_LOCK_SECONDS` | `900` | 15-minute temporary lock |
| `AUTH_LOGIN_ATTEMPT_RETENTION_DAYS` | `90` | bounded persistence of login-attempt evidence |

Production validation keeps the window/lock settings at one minute or more and bounds all values. Test environments may use shorter windows for deterministic expiry tests.

The 15-minute defaults intentionally align with the existing transport authentication limiter. Operators may tune them using measured attack/false-positive telemetry; changes require security review and regression testing.

## Public response policy

After CAPTCHA validation, the following conditions use the same public response:

```text
HTTP 401
Credenciales incorrectas.
```

This applies to:

- tenant not found;
- user not found;
- administrative `disabled`/other non-active account;
- active temporary throttle;
- incorrect password.

The response MUST NOT expose exact remaining attempts, threshold values, account existence, administrative status or lock duration.

A valid password may proceed to later controls (access expiry, licensing, MFA). Those later responses occur only after credential validation and therefore are not pre-authentication account-enumeration signals.

CAPTCHA and transport rate-limit failures retain their own statuses/messages because they are independent request-abuse controls, not account-existence signals.

## Administrative account semantics

`disabled` remains an explicit administrative state. Authentication code must never change it automatically after failed credentials.

A temporary throttle:

- expires without an administrator;
- does not write `UserProfile.status`;
- cannot reactivate a disabled account;
- does not cross tenant/RIF identity boundaries.

## Recovery runbook

### Legitimate user hits temporary throttle

1. Do not change `UserProfile.status`.
2. Confirm there is no broad authentication outage or active attack.
3. Ask the user to wait for the configured temporary lock to expire or use the normal password-recovery channel when available.
4. Review aggregated `auth.login.failed` and `auth.throttle.activated` events using `requestId`/`identityHash`; do not request or collect the user's password.
5. If failures continue after expiry, investigate credential stuffing and source-IP/device patterns before changing policy.

### Administratively disabled user

1. Treat `disabled` as a separate governance decision.
2. Verify the administrative reason/audit trail before reactivation.
3. Reactivation must be explicit through the authorized administrative flow; throttle expiry never changes `disabled`.

### User has no access to recovery email

Issue #89 does not create a new identity-proofing process. Escalate through the authorized administrative recovery procedure and require independent identity verification appropriate to the organization. Never bypass account ownership checks simply to clear a throttle.

## Security event catalog

Authentication telemetry is emitted as structured `[security:auth]` JSON. It contains a request correlation ID, an HMAC-pseudonymized normalized identity and safe operational metadata. It never receives the request body, password, CAPTCHA answer/token, authorization cookie/header, license key or device credential.

| Event | When | Important fields |
| --- | --- | --- |
| `auth.login.failed` | credential flow fails or request hits account throttle | `requestId`, `identityHash`, safe `tenantId` when resolved, internal reason, `throttled` when applicable |
| `auth.throttle.activated` | a persisted failure is the threshold-crossing attempt | `requestId`, `identityHash`, `lockedUntil`, configured failure limit |
| `auth.throttle.expired` | first later request observes an expired derived lock | `requestId`, `identityHash`, previous `lockedUntil` |
| `auth.login.succeeded` | password credential validation succeeds | `requestId`, `identityHash`, safe `tenantId` |

Internal failure reasons are observability metadata and MUST NOT be copied into public login responses.

## Data retention and privacy

- Existing `AuthLoginAttempt` contains normalized RIF/email, IP, success flag and timestamp.
- Retention cleanup is best-effort and defaults to 90 days.
- Successful login no longer deletes prior failure rows; it resets the throttle logically through a `success=true` boundary.
- Passwords, hashes, tokens, CAPTCHA values and license credentials are never stored in `AuthLoginAttempt`.
- Any future retention-policy change must consider incident-response needs and applicable privacy requirements.

## Concurrency properties

The throttle state is derived from append-only attempts rather than a mutable counter:

- concurrent failures are not lost;
- exactly one chronological failure defines the threshold crossing;
- later failures that were already in flight do not move `lockedUntil`;
- requests received after the lock is visible are rejected before bcrypt and are not persisted as new failures;
- a successful credential event resets subsequent replay state without deleting history.

The existing global and auth rate limits remain necessary to bound CPU/resource use during a distributed burst that was already in flight before the account threshold became visible.

## Rollout and rollback

No database schema migration is introduced by #89. Rollout therefore consists of deploying the application code and configuration defaults.

Rollback can revert the application commit without any database DDL. **Do not** restore the historical behavior that automatically writes `UserProfile.status='disabled'` after failed passwords. If emergency rollback is required, prefer temporarily disabling only the new derived-throttle evaluator while retaining CAPTCHA/rate limiting and generic credential responses.

## Verification required before merge

- unit tests: normalization, policy bounds, threshold, expiry, reset and concurrent in-flight behavior;
- real PostgreSQL API tests: 5+ failures, expiry, valid-password reset, disabled account, tenant isolation, casing, concurrent distributed attempts, CAPTCHA coexistence and telemetry redaction;
- backend typecheck/build;
- existing repository CI/security gates;
- independent AppSec/QA review on the candidate SHA.
