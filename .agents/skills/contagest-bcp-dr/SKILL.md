---
name: contagest-bcp-dr
description: Backup, restore, ransomware containment and business-continuity gate for ERP production data.
---

# ContaGest BCP / Disaster Recovery

## Trigger
Production readiness, DB/storage architecture changes, retention/deletion, migration, incident response or any change affecting recoverability.

## Principles
A backup that has never been restored is not verified recovery. Recovery must preserve tenant/accounting integrity and evidence.

## Required controls
- documented RPO/RTO by service tier;
- encrypted backups with credentials separate from primary runtime;
- offsite copy and retention appropriate to business/legal needs;
- point-in-time recovery where supported;
- restore drill into isolated environment;
- application + DB + object/file storage inventory;
- recovery of secrets/config through controlled escrow/rotation, never committed plaintext;
- ransomware blast-radius review and immutable/append-only protection where justified;
- audit evidence for destructive recovery operations.

## Restore drill
Select a timestamp/backup, restore into isolated environment, run migrations if required, verify tenant counts and representative financial totals, verify login/RBAC, verify selected exports, compare checksums/control totals, record duration and failures, then destroy isolated sensitive copy safely.

## Stop conditions
No recent backup, restore not tested, unknown RPO/RTO, backup credentials share the compromised blast radius, financial control totals fail after restore, or migration lacks recoverability => `BLOCK_PRODUCTION=yes`.

## Output
Backup source/time, restore target, control totals, RPO/RTO achieved, duration, evidence, gaps and production block decision.
