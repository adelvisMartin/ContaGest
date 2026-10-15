import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { validateIsolatedDatabaseUrl } from '../backend/scripts/hipico-report-share-rls-v1000.mjs';

const phrase='ephemeral-local-postgres17-hipico-share-rls';
const good='postgresql://postgres:fakepassword@127.0.0.1:5432/hipico_share_test_v1000';
test('isolated harness requires separate explicit consent, even for localhost',()=>{
  assert.throws(()=>validateIsolatedDatabaseUrl(good,''),/CONSENT/);
  assert.equal(validateIsolatedDatabaseUrl(good,phrase),good);
});
test('isolated harness rejects production/staging names, non-postgres and remote hosts',()=>{
  for(const url of [
    'postgresql://postgres:secret@127.0.0.1:5432/contagest',
    'postgresql://postgres:secret@127.0.0.1:5432/contagest_production',
    'postgresql://postgres:secret@supabase.co:5432/hipico_share_test_v1000',
    'postgresql://postgres:secret@192.168.1.10:5432/hipico_share_test_v1000',
    'https://postgres:secret@127.0.0.1/hipico_share_test_v1000',
    'postgresql://service_role:secret@127.0.0.1:5432/hipico_share_test_v1000',
    'postgresql://postgres:secret@127.0.0.1:5432/hipico_share_test_v1000?application_name=a',
    'postgresql://postgres:secret@127.0.0.1:5432/hipico_share_test_v1000#fragment',
    ''
  ])assert.throws(()=>validateIsolatedDatabaseUrl(url,phrase),url);
});
test('guarded CLI must fail without consent BEFORE importing PG and cannot expose database password',()=>{
  const run=spawnSync(process.execPath,['backend/scripts/hipico-report-share-rls-v1000.mjs'],{
    cwd:process.cwd(),encoding:'utf8',
    env:{...process.env,HIPICO_SHARE_RLS_DATABASE_URL:good,HIPICO_SHARE_RLS_CONSENT:''}
  });
  assert.equal(run.status,1);
  assert.match(run.stderr,/EXPLICIT_ISOLATED_CONSENT_REQUIRED/);
  assert.ok(!run.stderr.includes('fakepassword'));
});
test('script disallows accidental production without even a configured database',()=>{
  assert.throws(()=>validateIsolatedDatabaseUrl(undefined,phrase),/INVALID_URL/);
});

test('adversarial PG suite exercises lock contention and recovery rather than just storing a token',()=>{
  const src=fs.readFileSync(new URL('../backend/scripts/hipico-report-share-rls-v1000.mjs',import.meta.url),'utf8');
  const names=[
    'EXPIRED_AND_REVOKED_CAPABILITIES_ARE_INACTIVE',
    'ONLY_ACTIVE_GROUP_CAPABILITY_ELIGIBLE',
    'ACTIVE_TOKEN_ROW_LOCK_ACQUIRED',
    'CONCURRENT_REVOKE_BLOCKED_BY_REPORT_READER',
    'REVOKE_VISIBLE_ON_NEXT_TRANSACTION',
    'TRANSACTION_LOCAL_OWNER_RESET',
    'FOREIGN_OWNER_INSERT_DENIED',
    'FOREIGN_OWNER_REVOKE_DENIED'
  ];
  for (const name of names) assert.match(src,new RegExp('pass\\(\\\''+name+'\\\''),name);
  assert.match(src,/FOR SHARE/);
  assert.match(src,/lock_timeout='300ms'/);
  assert.match(src,/code==='55P03'/);
  assert.match(src,/await admin\.query\('ROLLBACK'\)/);
  assert.match(src,/await runtime\.query\('ROLLBACK'\)/);
  assert.doesNotMatch(src,/UPDATE public\.hipico_money_ledger_entries|DELETE FROM public\.hipico_money_ledger_entries/);
});
