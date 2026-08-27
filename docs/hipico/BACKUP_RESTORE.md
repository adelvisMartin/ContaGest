# Control Hípico — Backup / Restore (#117)

## Scope and inventory

Portable client backup includes the local business workspace: participants, jornadas/races, operational movements, settings contained in the workspace and local evidence contained in it. It explicitly excludes auth/session/token/cookie/QR/service-role/private-key/password/signed-URL material.

WhatsApp browser profiles and credentials are a **separate recovery domain** and are never exported by the default backup path.

The authoritative PostgreSQL append-only ledger from #108 is not replaced by a browser backup. Production restore must reconcile against that server ledger after client state is restored.

## Format v2

A backup carries `_backup` with:

- backup schema version;
- local IndexedDB schema version;
- product version;
- creation timestamp;
- SHA-256 of canonical sanitized workspace;
- inclusion/exclusion policy.

Legacy JSON remains importable only after an explicit warning because it cannot prove a historical hash. Future/incompatible schema or hash mismatch is rejected.

## Off-device encryption

Existing Export JSON and Import JSON actions are intercepted by `backup-secure-ui.js` before the legacy app handler. Export requires a passphrase of at least 12 characters and uses:

- PBKDF2-SHA256, 250,000 iterations;
- random 128-bit salt;
- AES-GCM-256;
- random 96-bit IV.

Plain workspace contents are not embedded in the encrypted envelope.

## Restore sequence

1. Parse/decrypt.
2. Validate format/schema.
3. Verify SHA-256 integrity.
4. Strip/reject unsupported secret material through the canonical sanitizer.
5. Reconcile duplicate IDs and malformed local monetary values.
6. Require explicit user confirmation.
7. Snapshot current local workspace (`antes-de-restore-portable`).
8. Replace primary local workspace.
9. Reload.
10. In production, reconcile restored client evidence with the authoritative #108 server ledger before declaring balances verified.

A restore never silently overwrites without confirmation and a pre-restore snapshot.

## Corruption and incompatibility

- hash mismatch → `HIPICO_BACKUP_HASH_MISMATCH`;
- future schema → `HIPICO_BACKUP_SCHEMA_INCOMPATIBLE`;
- wrong password/tampered ciphertext → `HIPICO_BACKUP_DECRYPT_FAILED`;
- duplicate IDs/invalid local monetary value → `HIPICO_BACKUP_RECONCILIATION_FAILED`;
- missing confirmation → `HIPICO_RESTORE_CONFIRMATION_REQUIRED`.

## RPO / RTO evidence

Repository tests can measure cryptographic parse/decrypt/validation time on synthetic data, but a meaningful device RTO includes file selection, IndexedDB write, reload and server-ledger reconciliation. Therefore release evidence must record:

- `RPO`: age of the selected backup at restore start;
- `RTO-local`: restore start → PWA usable with restored local workspace;
- `RTO-verified`: restore start → server-ledger reconciliation green.

Targets must be agreed before the physical drill. The measured values belong to the candidate SHA, not this document.

## Required drill

- clean browser/profile restore;
- fresh Android/PWA restore;
- corrupted JSON;
- changed hash;
- wrong passphrase;
- future schema;
- legacy migration;
- existing workspace replacement confirmation;
- interrupted restore/reload;
- post-restore #108 ledger reconciliation.

Until that device/test-database drill actually runs, those cases remain `NOT_EXECUTED/BLOCKED` rather than PASS.

## Rollback

Never roll back by deleting IndexedDB. A release rollback must understand local schema v2. See #118 compatibility set and downgrade policy.
