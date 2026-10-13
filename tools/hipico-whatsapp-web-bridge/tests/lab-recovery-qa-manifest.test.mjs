import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Guard the advertised LAB recovery command itself. A smaller command can
// look green while omitting the encrypted inbox, WAL, HMAC, operator handoff
// or actual socket failure coverage that must gate Windows QA.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const required=Object.freeze([
  'lab-canonical-query.test.mjs',
  'lab-query-backoff.test.mjs',
  'lab-pending-query-inbox.test.mjs',
  'lab-outgoing-evidence.test.mjs',
  'lab-confirmed-quote-hint.test.mjs',
  'lab-handoff-eligibility.test.mjs',
  'lab-integrated-orchestration.test.mjs',
  'lab-test-reply-journal.test.mjs',
  'lab-ack-report.test.mjs',
  'lab-confirmed-encrypted-quote.test.mjs',
  'lab-confirmed-context-return.test.mjs',
  'lab-real-tcp-recovery.test.mjs',
  'lab-recovery-qa-manifest.test.mjs'
]);
const testPaths=required.map(name=>'tests/'+name);

test('LAB targeted recovery command executes every security and restart suite',()=>{
  const script=manifest.scripts?.['test:lab:recovery'];
  assert.equal(typeof script,'string');
  const args=script.trim().split(/\s+/);
  assert.deepEqual(args.slice(0,2),['node','--test'],
    'use Node built-in test runner; no dynamic skip or test filtering');
  const supplied=args.slice(2);
  assert.equal(supplied.length,new Set(supplied).size,'no duplicated suites');
  assert.deepEqual([...supplied].sort(),[...testPaths].sort(),
    'all LAB recovery gates must be explicitly present');
  for(const name of supplied){
    assert.match(name,/^tests\/[a-z0-9-]+\.test\.mjs$/);
    assert.equal(fs.statSync(path.join(root,name)).isFile(),true,name);
  }
});

test('recovery test files have a fast preflight syntax check on Windows',()=>{
  const commands=String(manifest.scripts?.check||'')
    .split(/\s*&&\s*/).map(part=>part.trim());
  for(const name of [
    'lab-pending-query-inbox.test.mjs',
    'lab-confirmed-encrypted-quote.test.mjs',
    'lab-confirmed-context-return.test.mjs',
    'lab-real-tcp-recovery.test.mjs',
    'lab-test-reply-journal.test.mjs',
    'lab-ack-report.test.mjs',
    'lab-recovery-qa-manifest.test.mjs'
  ]){
    assert.ok(commands.includes('node --check tests/'+name),
      'syntax gate omitted: '+name);
  }
});

test('full project QA still runs all Node tests after syntax checks',()=>{
  assert.equal(manifest.scripts?.qa,'npm run check && npm test');
  assert.equal(manifest.scripts?.test,'node --test tests/*.test.mjs');
  assert.equal(manifest.scripts?.['test:lab:tcp'],
    'node --test tests/lab-real-tcp-recovery.test.mjs');
  assert.equal(manifest.engines?.node,'>=22 <23');
});
