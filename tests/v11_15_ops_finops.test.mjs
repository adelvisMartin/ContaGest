import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('self-host production keeps Postgres private and separates migration from runtime credentials',()=>{
  const compose=read('ops/docker/docker-compose.production.yml');
  const init=read('ops/docker/postgres-init/00-roles.sh');
  assert.match(compose,/DATABASE_RUNTIME_URL: postgresql:\/\/contagest_app/);
  assert.match(compose,/migrate:/);
  assert.match(compose,/DATABASE_URL: postgresql:\/\/\$\{POSTGRES_USER/);
  assert.doesNotMatch(compose,/5432:5432/);
  assert.match(init,/contagest_app LOGIN PASSWORD/);
  assert.match(init,/NOSUPERUSER/);
  assert.match(init,/NOBYPASSRLS/);
});

test('shared-project backup scope explicitly excludes Budget Wallet and Hipico',()=>{
  const script=read('ops/backup/backup-postgres.sh');
  const tables=read('ops/backup/contagest-public-tables.txt');
  assert.match(script,/BACKUP_SCOPE/);
  assert.match(script,/BACKUP_AGE_RECIPIENT/);
  assert.match(script,/RCLONE_REMOTE/);
  assert.doesNotMatch(tables,/budgetwallet_/i);
  assert.doesNotMatch(tables,/hipico_/i);
  assert.match(tables,/TenantMembership/);
  assert.match(tables,/SubscriptionPayment/);
});

test('restore drill refuses ordinary production database names by default',()=>{
  const restore=read('ops/backup/restore-drill.sh');
  assert.match(restore,/\(_restore\|_drill\)/);
  assert.match(restore,/ALLOW_UNSAFE_RESTORE/);
  assert.match(restore,/LicenseKey table missing/);
});

test('FinOps strategy does not require paid cloud before revenue',()=>{
  const finops=read('docs/FINOPS_GROWTH_GATES.md');
  assert.match(finops,/Gate 0 — 0 clientes pagos/);
  assert.match(finops,/infraestructura sigue al ingreso/i);
  assert.match(finops,/activación\/onboarding \+ suscripción/);
  assert.match(finops,/USD 12 por empresa adicional/);
});

test('marketing claim register bans unverifiable absolute security promises',()=>{
  const claims=read('docs/MARKETING_CLAIMS_REGISTER.md');
  assert.match(claims,/Inhackeable/);
  assert.match(claims,/Cifrado de extremo a extremo/);
  assert.match(claims,/Cumplimiento fiscal garantizado/);
  assert.match(claims,/Soporte 24\/7/);
});
