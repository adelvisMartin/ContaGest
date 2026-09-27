---
name: contagest-bcp-dr
description: Backup, restore, ransomware containment and business-continuity gate for ERP production data.
contractVersion: 2
---

# ContaGest BCP / Disaster Recovery

## Trigger
Production readiness, DB/storage architecture changes, retention/deletion, migration, incident response or any change affecting recoverability.

## Non-trigger
Do not claim recoverability from backup configuration alone; a restore that has not executed is not verified recovery.

## Authority
Owner recovery requirements, `AGENTS.md`, database/storage authorities and executed restore evidence outrank documentation snapshots.

## Source of truth
Backup configuration, retention policy, isolated restore runs, DB/storage inventories and control totals.

## Graphify probes
Use to locate persistence/storage/config dependencies only; never treat a graph as restore evidence.

## Inputs
Exact SHA, service tier, RPO/RTO target, backup identity/time, storage inventory, representative tenant/financial control totals and recovery environment.

## Invariants
Encrypted/offsite backups; separated credentials; appropriate retention/PITR; isolated restore drill; application+DB+object storage inventory; controlled secret recovery; ransomware blast-radius review; audit evidence for destructive recovery actions.

## Workflow
Select a timestamp/backup, restore in isolation, apply migrations if required, verify tenant counts and representative financial totals, login/RBAC and selected exports, compare checksums/control totals, record duration/failures, then safely destroy the isolated sensitive copy.

## Negative tests
Missing object storage, stale backup, compromised shared credentials, failed migration during restore, tenant-count mismatch, financial-control mismatch and unavailable secret/config recovery.

## Stop conditions
No recent backup, restore not tested, unknown RPO/RTO, shared compromise blast radius, failed financial control totals or migration without recoverability => `BLOCK_PRODUCTION=yes`.

## Verification
Execute a restore drill for production sign-off; record timestamps, versions, control totals and achieved RPO/RTO.

## Output schema
Backup source/time; restore target; control totals; achieved RPO/RTO; duration; `STATUS`; gaps; production block decision.

## References
`AGENTS.md`, `contagest-db-migration-safety`, `contagest-release-evidence`.
