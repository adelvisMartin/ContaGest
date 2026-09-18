import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');
const inventory=(await read('ops/backup/hipico-public-tables.txt'))
  .split(/\r?\n/)
  .map((line)=>line.trim())
  .filter((line)=>line && !line.startsWith('#'));

function listedHipicoTables(sql){
  return [...new Set([...sql.matchAll(/public\.(hipico_[a-z0-9_]+)/gi)].map((match)=>match[1].toLowerCase()))].sort();
}

test('v25 provisioning role contract is fixed-name, secret-driven and least-privilege',async()=>{
  const sql=await read('ops/database/provision-hipico-backup-role.sql');
  assert.match(sql,/hipico_backup/i);
  assert.match(sql,/hipico_backup_password/);
  assert.doesNotMatch(sql,/PASSWORD\s+'[^']+'/i);
  for(const flag of ['NOSUPERUSER','NOCREATEDB','NOCREATEROLE','NOINHERIT','NOREPLICATION','NOBYPASSRLS']){
    assert.match(sql,new RegExp(flag,'i'));
  }
  assert.match(sql,/LOGIN/i);
  assert.match(sql,/REVOKE\s+CREATE\s+ON\s+SCHEMA\s+public\s+FROM\s+hipico_backup/i);
  assert.match(sql,/GRANT\s+USAGE\s+ON\s+SCHEMA\s+public\s+TO\s+hipico_backup/i);
  assert.match(sql,/GRANT\s+CONNECT\s+ON\s+DATABASE/i);
  assert.doesNotMatch(sql,/ALTER\s+DEFAULT\s+PRIVILEGES/i);
});

test('v25 provisioning grants SELECT to exactly the canonical 25-table inventory',async()=>{
  const sql=await read('ops/database/provision-hipico-backup-role.sql');
  assert.equal(inventory.length,25);
  assert.deepEqual(listedHipicoTables(sql),[...inventory].sort());
  assert.match(sql,/GRANT\s+SELECT\s+ON\s+TABLE/i);
  assert.doesNotMatch(sql,/GRANT\s+SELECT\s+ON\s+ALL\s+TABLES/i);
  assert.doesNotMatch(sql,/GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)[^;]*TO\s+hipico_backup/i);
});

test('v25 provisioning revokes stale scope, auth access and every role membership',async()=>{
  const sql=await read('ops/database/provision-hipico-backup-role.sql');
  assert.match(sql,/REVOKE\s+ALL\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+FROM\s+hipico_backup/i);
  assert.match(sql,/REVOKE\s+ALL\s+ON\s+SCHEMA\s+auth\s+FROM\s+hipico_backup/i);
  assert.match(sql,/REVOKE\s+ALL\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+auth\s+FROM\s+hipico_backup/i);
  assert.match(sql,/pg_auth_members/i);
  assert.match(sql,/REVOKE.*FROM hipico_backup/i);
});

test('v25 verifier fails closed on flags, memberships, scope drift, writes and auth access',async()=>{
  const sql=await read('ops/database/verify-hipico-backup-role.sql');
  for(const marker of [
    'rolsuper','rolcreatedb','rolcreaterole','rolinherit','rolreplication','rolbypassrls',
    'pg_auth_members','has_table_privilege','information_schema.role_table_grants',
    'auth.users','HIPICO_BACKUP_ROLE'
  ]) assert.match(sql,new RegExp(marker,'i'));
  assert.match(sql,/RAISE EXCEPTION/i);
  assert.deepEqual(listedHipicoTables(sql),[...inventory].sort());
  assert.doesNotMatch(sql,/CREATE\s+ROLE|ALTER\s+ROLE|GRANT\s+/i);
});

test('v25 runbook is manual-only and requires verify before secrets are enabled',async()=>{
  const doc=await read('docs/hipico/HIPICO_BACKUP_ROLE_ACTIVATION.md');
  assert.match(doc,/manual/i);
  assert.match(doc,/provision-hipico-backup-role\.sql/);
  assert.match(doc,/verify-hipico-backup-role\.sql/);
  assert.match(doc,/HIPICO_BACKUP_DATABASE_URL/);
  assert.match(doc,/hipico_backup_password/);
  assert.match(doc,/verify.*before|before.*verify|verific.*antes/i);
  assert.match(doc,/rollback/i);
  assert.match(doc,/NOBYPASSRLS/i);
});

test('v25 provisioning is never executed by a GitHub workflow',async()=>{
  const tree=await read('.github/workflows/hipico-schema-backup-restore-v23.yml');
  const changeControl=await read('.github/workflows/hipico-schema-change-control-v24.yml');
  for(const workflow of [tree,changeControl]){
    assert.doesNotMatch(workflow,/provision-hipico-backup-role\.sql/);
    assert.doesNotMatch(workflow,/hipico_backup_password/);
  }
});
