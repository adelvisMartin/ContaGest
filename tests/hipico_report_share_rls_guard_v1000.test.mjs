import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
