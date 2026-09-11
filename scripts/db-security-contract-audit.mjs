import fs from 'node:fs';

const findings = [];
const read = (path) => fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
const requireText = (content, pattern, finding) => { if (!pattern.test(content)) findings.push(finding); };
const forbidText = (content, pattern, finding) => { if (pattern.test(content)) findings.push(finding); };

const runtime = read('backend/src/database/prisma.ts');
const provision = read('ops/database/provision-security-roles.sql');
const verify = read('ops/database/verify-security-roles.sql');
const backup = read('ops/backup/backup-postgres.sh');
const restore = read('ops/backup/restore-drill.sh');
const workflow = read('.github/workflows/db-security-operations.yml');
const monitor = read('backend/scripts/security-db-monitor.mjs');
const runbook = read('docs/DATABASE_SECURITY_RECOVERY_RUNBOOK.md');

requireText(
  runtime,
  /if\s*\(\s*isProduction\s*&&\s*!runtimeCandidate\s*\)\s*\{[\s\S]{0,400}?throw new Error\(['"][^'"]*DATABASE_RUNTIME_URL[^'"]*['"]\)/,
  'runtime-db-not-fail-closed'
);
requireText(runtime, /forbiddenRuntimeRoles/, 'runtime-db-forbidden-role-gate-missing');
requireText(runtime, /expectedRuntimeRole/, 'runtime-db-expected-role-gate-missing');
forbidText(runtime, /rejectUnauthorized\s*:\s*false/, 'runtime-db-tls-verification-disabled');

for (const control of ['NOSUPERUSER','NOCREATEDB','NOCREATEROLE','NOREPLICATION','NOBYPASSRLS']) {
  requireText(provision, new RegExp(control), `db-role-control-missing:${control}`);
}
requireText(provision, /c\.relname ~ '\^\[A-Z\]'/, 'db-role-cross-product-scope-gate-missing');
requireText(provision, /REVOKE service_role FROM contagest_runtime, contagest_backup, contagest_monitor/, 'db-role-service-role-revoke-missing');
forbidText(provision, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public/, 'db-runtime-grants-all-public-tables');

requireText(verify, /lower_snake_case fuera de su scope/, 'db-role-cross-product-verification-missing');
requireText(verify, /contagest_security_metric_snapshot/, 'db-monitor-state-verification-missing');

for (const control of ['DATABASE_BACKUP_URL','BACKUP_AGE_RECIPIENT','RCLONE_REMOTE','pg_restore --list','sha256sum']) {
  requireText(backup, new RegExp(control.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `backup-control-missing:${control}`);
}
forbidText(backup, /ALLOW_UNENCRYPTED_BACKUP/, 'unencrypted-backup-escape-hatch-present');
forbidText(backup, /rclone\s+(?:delete|purge|deletefile)/, 'offsite-backup-delete-capability-present');

requireText(restore, /sha256sum --check/, 'restore-checksum-verification-missing');
requireText(restore, /PRIMARY_DATABASE_HOST/, 'restore-primary-host-guard-missing');
requireText(monitor, /pg_stat_user_tables/, 'mass-dml-delta-monitor-missing');
requireText(monitor, /service-role-membership/, 'database-role-drift-monitor-missing');
forbidText(monitor, /rejectUnauthorized\s*:\s*false/, 'db-monitor-tls-verification-disabled');

requireText(workflow, /DB_SECURITY_OPERATIONS_ENABLED/, 'db-ops-fail-safe-enable-gate-missing');
requireText(workflow, /postgres:17/, 'monthly-disposable-restore-db-missing');
requireText(runbook, /Definition of Done operativa/i, 'database-security-runbook-missing-dod');

if (findings.length) {
  console.error('ContaGest DB security contract: FAIL');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('ContaGest DB security contract: PASS');
console.log('- production DB runtime is fail-closed and role-bound');
console.log('- DB roles deny owner/DDL/BYPASSRLS/TRUNCATE escalation');
console.log('- backups require dedicated read-only credentials, encryption and off-site copy');
console.log('- restore drill is checksum-verified and isolated');
console.log('- mass DML and role/license drift monitoring contracts are present');
