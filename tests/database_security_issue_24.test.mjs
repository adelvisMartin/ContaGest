import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const prismaRuntime = read('backend/src/database/prisma.ts');
const envExample = read('backend/.env.example');
const provision = read('ops/database/provision-security-roles.sql');
const verify = read('ops/database/verify-security-roles.sql');
const backup = read('ops/backup/backup-postgres.sh');
const restore = read('ops/backup/restore-drill.sh');
const tableInventory = read('ops/backup/contagest-public-tables.txt');
const monitor = read('backend/scripts/security-db-monitor.mjs');
const workflow = read('.github/workflows/db-security-operations.yml');
const runbook = read('docs/DATABASE_SECURITY_RECOVERY_RUNBOOK.md');

test('production database runtime is fail-closed and cannot silently fall back to owner credentials', () => {
  assert.match(prismaRuntime, /DATABASE_RUNTIME_URL es obligatorio en producción/);
  assert.match(prismaRuntime, /forbiddenRuntimeRoles/);
  for (const role of ['postgres', 'service_role', 'supabase_admin']) assert.match(prismaRuntime, new RegExp(`['"]${role}['"]`));
  assert.match(prismaRuntime, /role !== expectedRuntimeRole/);
  assert.match(prismaRuntime, /port !== '6543'/);
  assert.match(prismaRuntime, /pgbouncer/);
});

test('environment contract separates runtime, migration, backup and monitoring credentials', () => {
  for (const name of ['DATABASE_RUNTIME_URL', 'DIRECT_DATABASE_URL', 'DATABASE_BACKUP_URL', 'DATABASE_MONITOR_URL']) {
    assert.match(envExample, new RegExp(`^${name}=`, 'm'));
  }
  assert.match(envExample, /contagest_runtime\./);
  assert.match(envExample, /contagest_backup/);
  assert.match(envExample, /contagest_monitor\./);
});

test('dedicated PostgreSQL roles are non-superuser, non-DDL and do not inherit service_role', () => {
  for (const role of ['contagest_runtime', 'contagest_backup', 'contagest_monitor']) assert.match(provision, new RegExp(role));
  for (const restriction of ['NOSUPERUSER', 'NOCREATEDB', 'NOCREATEROLE', 'NOREPLICATION', 'NOBYPASSRLS']) assert.match(provision, new RegExp(restriction));
  assert.match(provision, /REVOKE CREATE ON SCHEMA public/);
  assert.match(provision, /REVOKE TRUNCATE, REFERENCES, TRIGGER/);
  assert.match(provision, /REVOKE service_role FROM contagest_runtime, contagest_backup, contagest_monitor/);
  assert.match(provision, /c\.relname ~ '\^\[A-Z\]'/);
  assert.doesNotMatch(provision, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public/);
});

test('verification gate checks privilege drift, cross-product scope and monitor state', () => {
  assert.match(verify, /violan el contrato de mínimo privilegio/);
  assert.match(verify, /no debe tener TRUNCATE/);
  assert.match(verify, /debe ser read-only/);
  assert.match(verify, /no puede heredar service_role/);
  assert.match(verify, /lower_snake_case fuera de su scope/);
  assert.match(verify, /contagest_security_metric_snapshot/);
});

test('off-site backup requires dedicated role, encryption, checksum and remote verification', () => {
  assert.match(backup, /DATABASE_BACKUP_URL/);
  assert.match(backup, /DATABASE_BACKUP_EXPECTED_ROLE:-contagest_backup/);
  assert.match(backup, /BACKUP_AGE_RECIPIENT/);
  assert.match(backup, /RCLONE_REMOTE/);
  assert.match(backup, /pg_restore --list/);
  assert.match(backup, /sha256sum/);
  assert.match(backup, /rclone copyto/);
  assert.match(backup, /rclone lsf/);
  assert.doesNotMatch(backup, /ALLOW_UNENCRYPTED_BACKUP/);
  assert.doesNotMatch(backup, /rclone delete|rclone purge|rclone deletefile/);
});

test('backup inventory contains security/commercial tables discovered in the live schema', () => {
  for (const table of ['CookiePreference', 'LegalAcceptance', 'HipicoBotOutbox', 'HipicoWebhookEvent', 'CustomerAccount', 'Subscription', 'Commission']) {
    assert.match(tableInventory, new RegExp(`^${table}$`, 'm'));
  }
});

test('restore drill is destructive only against explicitly disposable databases and validates checksum first', () => {
  assert.match(restore, /\(_restore\|_drill\)/);
  assert.match(restore, /PRIMARY_DATABASE_HOST/);
  assert.match(restore, /sha256sum --check/);
  assert.match(restore, /pg_restore --list/);
  assert.match(restore, /Subscription table missing/);
});

test('DB monitor uses hourly deltas, checks role drift and audits license/RBAC changes', () => {
  assert.match(monitor, /pg_stat_user_tables/);
  assert.match(monitor, /contagest_security_metric_snapshot/);
  assert.match(monitor, /mass-table-change/);
  assert.match(monitor, /service-role-membership/);
  assert.match(monitor, /LicenseKey\|LicenseActivation\|Role\|RolePermission\|Permission\|UserRole/);
  assert.doesNotMatch(monitor, /rejectUnauthorized:\s*false/);
});

test('operations workflow separates hourly monitor, daily backup and monthly restore drill', () => {
  assert.match(workflow, /cron: '17 \* \* \* \*'/);
  assert.match(workflow, /cron: '23 3 \* \* \*'/);
  assert.match(workflow, /cron: '37 4 1 \* \*'/);
  assert.match(workflow, /DB_SECURITY_OPERATIONS_ENABLED/);
  assert.match(workflow, /postgres:17/);
  assert.match(workflow, /contagest_drill/);
  assert.match(workflow, /BACKUP_AGE_IDENTITY_B64/);
});

test('runbook documents fail-closed activation, external immutability, RPO/RTO and tenant isolation residual risk', () => {
  assert.match(runbook, /fail-closed/i);
  assert.match(runbook, /object lock\/immutability/i);
  assert.match(runbook, /RPO/i);
  assert.match(runbook, /RTO/i);
  assert.match(runbook, /no deben presentarse como aislamiento tenant de base de datos completo/i);
  assert.match(runbook, /Definition of Done operativa/i);
});
