import test from 'node:test';
import assert from 'node:assert/strict';
import { labReplayPruneUrl, labReplayPruneDue } from '../src/lab-replay-maintenance.mjs';

test('derives maintenance only from the same pinned HTTPS Bridge ingest origin',()=>{
  assert.equal(
    labReplayPruneUrl('https://contagest.example/api/v1/hipico/bridge/events'),
    'https://contagest.example/api/v1/hipico/bridge/maintenance/lab-replay-prune'
  );
  assert.equal(
    labReplayPruneUrl('http://127.0.0.1:3000/api/v1/hipico/bridge/events'),
    'http://127.0.0.1:3000/api/v1/hipico/bridge/maintenance/lab-replay-prune'
  );
});
test('fails closed for untrusted or malformed ingest destinations',()=>{
  for(const url of [
    '', 'javascript:alert(1)', 'http://contagest.example/api/v1/hipico/bridge/events',
    'https://attacker.example/bridge/events?redirect=1',
    'https://user:password@contagest.example/bridge/events',
    'https://contagest.example/bridge/events#frag',
    'https://contagest.example/bridge/maintenance/lab-replay-prune',
    'https://contagest.example/bridge/other'
  ])assert.equal(labReplayPruneUrl(url),null,url);
});
test('periodic prune remains disabled offline, does not run more than once per minute',()=>{
  const inputs={backendSyncEnabled:true,lastAttemptAt:5000,now:64_999};
  assert.equal(labReplayPruneDue(inputs),false);
  assert.equal(labReplayPruneDue({...inputs,now:65_000}),true);
  assert.equal(labReplayPruneDue({...inputs,backendSyncEnabled:false,now:70_000}),false);
});
test('operational Bridge invokes retention before requiring WhatsApp login',async()=>{
  const fs=await import('node:fs/promises');
  const source=await fs.readFile(new URL('../src/index.mjs',import.meta.url),'utf8');
  const begin=source.indexOf('async function monitor()');
  const prune=source.indexOf('await pruneLabReplayFromBridge()',begin);
  const login=source.indexOf('if (!(await isLoggedIn()))',begin);
  assert.ok(begin>=0&&prune>begin&&prune<login);
  assert.match(source,/async function pruneLabReplayFromBridge/);
});
