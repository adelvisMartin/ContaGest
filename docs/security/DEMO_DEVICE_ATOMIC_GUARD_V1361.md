# #1361 — Device-slot concurrency and revocation guard (partial implementation)

Baseline: `main@5cbd858803275f3033019a8977b38fb772333c71` (2026-11-19). Scope is **only** the existing backend `validateUserLicense` → `activateOrUpgradeDevice` → `LicenseKey` / `LicenseActivation` path; no changes to Control Hípico Android, cookies, subscription/entitlement authority or production schemas.

## Behaviors implemented

- The server takes `SELECT ... FOR UPDATE` on the exact tenant-scoped `LicenseKey` inside a Prisma transaction **before** reading an activation and counting occupied device seats. It rechecks the **current** license `status`, `revokedAt`, `expiresAt`, `plan`, and `maxDevices` under that lock, rather than using a possibly stale caller snapshot. Concurrent activations serialize; a second new device cannot pass the current limit after expiry, downgrade or revocation.
- A revoked/blocked device cannot be upgraded by reusing its `deviceId` and license key. An existing **trial** with a revoked/blocked activation cannot enroll a *different* client-provided device ID; an owner-authorized new trial grant is required.
- Credential refresh never changes an existing non-null `userId` binding. Its conditional UPDATE requires status `active` and the same credential hash; zero affected rows fail closed after concurrent revocation. Existing active legacy activations without a credential may upgrade once.
- No MAC/IMEI/Android ID, hardware fingerprint, network metadata or Play Integrity claims are introduced as the source of authorization. `deviceId` is **not** proof of physical device possession; this guard does not falsely promote it into one.

## Evidence and mandatory follow-up gates

The regression assertions in `tests/access_licensing_clean_code_batch6.test.mjs` are **source contracts**, not PostgreSQL concurrency or physical-device execution.

Before the **full** #1361 DoD:
1. Native **ContaGest** Android build, non-exportable per-installation Android Keystore asymmetric key, challenge signature verification with nonce and short TTL, optional hardware attestation and server-side Play Integrity Standard API verification with app/tenant/license audience and request binding.
2. Owner-approved PENDING → ACTIVE enrollment, device recovery/replacement, explicit audits, session/refresh/cache revocation and retry-safe challenge consumption; preserve normal web access. No mobile self-enrollment based solely on a password, key or caller-provided device ID.
3. PostgreSQL 17 isolated/ephemeral concurrent A/B tests (two devices vs one slot, revoked/blocked re-enrollment, wrong user, stale status, rollback), security reviews and device tests (reinstall, offline, lost phone, sideload, bad attestation). Record exact SHA, cleanup and logs.
4. Execute Node 22 `npm ci`, backend typecheck, focused contracts, build and all affected CI gates; no source check is a PASS substitute.

Risk/rollback: transactional row locks can increase waiting under simultaneous license validation; measure contention and p95 before release. Rollback is a revert of the isolated server/test change, **not** schema rollback. The vulnerability of first activation via caller-provided `deviceId` remains a **P0 security blocker** for Android demos until the native proof/enrollment workflow is complete; this PR must remain DRAFT.

References: [Android Keystore](https://developer.android.com/privacy-and-security/keystore), [Android Key Attestation](https://developer.android.com/privacy-and-security/security-key-attestation), [Google Play Integrity Standard](https://developer.android.com/google/play/integrity/standard), [OWASP MASVS](https://mas.owasp.org/MASVS/).
