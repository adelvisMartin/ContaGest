import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectHipicoRestoreTarget} from '../scripts/hipico-restore-target-policy-v842.mjs';

const validator=fileURLToPath(new URL('../scripts/hipico-restore-target-policy-v842.mjs',import.meta.url));
const restore=readFileSync(new URL('../ops/backup/hipico-restore-drill.sh',import.meta.url),'utf8');

test('#842 legitimate disposable loopback targets are accepted',()=>{
  const allowed=[
    ['postgresql://postgres:secret@127.0.0.1:5432/hipico_schema_restore','127.0.0.1','hipico_schema_restore'],
    ['postgres://operator:secret@localhost/work_drill','localhost','work_drill'],
    ['postgresql://operator:secret@[::1]:5432/candidate_restore','[::1]','candidate_restore']
  ];
  for(const [uri,host,database] of allowed){
    assert.deepEqual(inspectHipicoRestoreTarget(uri),{host,database});
  }
});

test('#842 reject URL parameters that can redirect a destructive restore outside loopback',()=>{
  for(const uri of [
    'postgresql://admin:secret@localhost/hipico_restore?hostaddr=203.0.113.9',
    'postgresql://admin:secret@localhost/hipico_restore?host=prod.internal',
    'postgresql://admin:secret@localhost/hipico_restore?service=production',
    'postgresql://admin:secret@localhost/hipico_restore?sslmode=require',
    'postgresql://admin:secret@localhost/hipico_restore#hidden',
    'postgresql://admin:secret@db.example/hipico_restore',
    'postgresql://admin:secret@10.0.0.1/hipico_restore',
    'postgresql://admin:secret@localhost/production',
    'postgresql://admin:secret@localhost/hipico_restore/another',
    'postgresql://admin:secret@localhost/hipico%2Frestore_drill',
    'postgresql://localhost/hipico_restore',
    'http://admin:secret@localhost/hipico_restore'
  ]) assert.throws(()=>inspectHipicoRestoreTarget(uri),/HIPICO_RESTORE_TARGET_UNSAFE/);
});

test('#842 inherited libpq host/service overrides are never allowed to redirect the target',()=>{
  const uri='postgresql://operator:secret@127.0.0.1:5432/hipico_restore';
  for(const variable of ['PGHOST','PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGPORT','PGDATABASE']){
    assert.throws(()=>inspectHipicoRestoreTarget(uri,{[variable]:'production.internal'}),
      /HIPICO_RESTORE_TARGET_UNSAFE/,variable);
  }
  assert.deepEqual(inspectHipicoRestoreTarget(uri,{PGPASSWORD:'dummy'}),
    {host:'127.0.0.1',database:'hipico_restore'});
});

test('#842 validator CLI rejects unsafe URI without echoing DB passwords',()=>{
  const secret='qa-secret-never-logged';
  const proc=spawnSync(process.execPath,[validator],{
    encoding:'utf8',
    env:{...process.env,HIPICO_RESTORE_DATABASE_URL:
      `postgresql://admin:${secret}@localhost/qa_restore?hostaddr=203.0.113.1`}
  });
  assert.equal(proc.status,5);
  assert.match(proc.stderr,/HIPICO_RESTORE_TARGET_UNSAFE/);
  assert.doesNotMatch(proc.stdout+proc.stderr,new RegExp(secret));
});

test('#842 restore shell must validate URL before decryption, psql or destructive SQL',()=>{
  const syntax=spawnSync('bash',['-n',fileURLToPath(new URL('../ops/backup/hipico-restore-drill.sh',import.meta.url))],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
  const guard=restore.indexOf('hipico-restore-target-policy-v842.mjs');
  assert.ok(guard>=0);
  for(const operation of ['age -d','prepare-hipico-restore-ephemeral.sql','pg_restore --dbname','truncate_sql']){
    assert.ok(guard<restore.indexOf(operation),`guard must precede ${operation}`);
  }
  assert.doesNotMatch(restore,/node --input-type=module - "\$HIPICO_RESTORE_DATABASE_URL"/);
  assert.match(restore,/restore_parts="\$\(node scripts\/hipico-restore-target-policy-v842\.mjs\)" \|\|/);
});


test('#842 source/restore collision is denied before decrypt, SQL, truncate and pg_restore',()=>{
  const shaGuard=restore.indexOf('Backup SHA mismatch.');
  const collision=restore.indexOf('"$target_database" != "$restore_database"');
  const verifyInventory=restore.indexOf('Table inventory digest mismatch.');
  assert.ok(shaGuard>=0&&collision>shaGuard&&collision<verifyInventory,
    'must validate authenticated manifest before destructive SQL');
  assert.match(restore,/\[\[ -n "\$target_database" && "\$target_database" != "\$restore_database" \]\] \|\|/);
  for(const operation of [
    'age -d','pg_restore --list','prepare-hipico-restore-ephemeral.sql',
    'psql "$HIPICO_RESTORE_DATABASE_URL"','pg_restore --dbname','truncate_sql'
  ]){
    assert.ok(collision<restore.indexOf(operation),
      'source/target collision must be denied before '+operation);
  }
});
