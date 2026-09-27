import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildHipicoTestArgs, discoverHipicoRootContracts } from '../scripts/hipico-root-contracts.mjs';

test('root Hípico contract discovery is deterministic and ignores unrelated files',()=>{
  const root=mkdtempSync(join(tmpdir(),'hipico-contract-discovery-'));
  mkdirSync(join(root,'tests'));
  writeFileSync(join(root,'tests','hipico_z.test.mjs'),'','utf8');
  writeFileSync(join(root,'tests','hipico_a.test.mjs'),'','utf8');
  writeFileSync(join(root,'tests','other.test.mjs'),'','utf8');
  mkdirSync(join(root,'tests','hipico_directory.test.mjs'));
  assert.deepEqual(discoverHipicoRootContracts(root),[
    join('tests','hipico_a.test.mjs'),
    join('tests','hipico_z.test.mjs')
  ]);
});

test('root discovery automatically includes newly added Hípico regression files',()=>{
  const files=discoverHipicoRootContracts();
  for(const expected of [
    'tests/hipico_bridge_payload_contract_297.test.mjs',
    'tests/hipico_bridge_replay_flags_297.test.mjs',
    'tests/hipico_meta_retry_after_297.test.mjs',
    'tests/hipico_root_contract_discovery_297.test.mjs'
  ]){
    assert.ok(files.some((file)=>file.replaceAll('\\','/')===expected),`missing ${expected}`);
  }
});

test('Vercel isolated Hípico execution runs the test file directly under the bounded heap',()=>{
  assert.deepEqual(buildHipicoTestArgs(['tests/hipico_a.test.mjs'],{
    isolated:true,
    heapLimitMb:256,
    effectiveConcurrency:1
  }),[
    '--max-old-space-size=256',
    'tests/hipico_a.test.mjs'
  ]);
});

test('non-Vercel Hípico execution preserves the canonical node test-runner contract',()=>{
  assert.deepEqual(buildHipicoTestArgs(['tests/hipico_a.test.mjs','tests/hipico_z.test.mjs'],{
    isolated:false,
    heapLimitMb:256,
    effectiveConcurrency:4
  }),[
    '--test',
    '--test-concurrency=4',
    'tests/hipico_a.test.mjs',
    'tests/hipico_z.test.mjs'
  ]);
});
