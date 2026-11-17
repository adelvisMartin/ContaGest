import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { validHipicoPhysicalMaterial } from '../scripts/hipico-physical-material-integrity-v119.mjs';

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hipico-physical-proof-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const manifest=path.join(dir,'physical-qa-evidence.json');
  const proof=path.join(dir,'device-proof.log');
  fs.writeFileSync(manifest,'{}');
  fs.writeFileSync(proof,'synthetic QA fixture, NOT operational evidence');
  const digest=crypto.createHash('sha256').update(fs.readFileSync(proof)).digest('hex');
  return {dir,manifest,proof,rows:[{path:'device-proof.log',sha256:digest,scenario:'fresh-install'}]};
}

test('#119 verifies physical material bytes against SHA-256 at release verification',async t=>{
  const f=fixture(t);
  assert.equal(await validHipicoPhysicalMaterial(f.manifest,f.rows),true);
  assert.equal(await validHipicoPhysicalMaterial(f.manifest,[...f.rows,...f.rows]),true);
});

test('#119 altered physical proof rejects release despite a valid-looking JSON digest',async t=>{
  const f=fixture(t);
  fs.appendFileSync(f.proof,' tampered');
  assert.equal(await validHipicoPhysicalMaterial(f.manifest,f.rows),false);
});

test('#119 missing or directory evidence cannot authorize release',async t=>{
  const f=fixture(t);
  assert.equal(await validHipicoPhysicalMaterial(f.manifest,[{...f.rows[0],path:'missing.log'}]),false);
  assert.equal(await validHipicoPhysicalMaterial(f.manifest,[{...f.rows[0],path:'.'}]),false);
});

test('#119 refuses symlinks and parent-directory traversal',async t=>{
  const f=fixture(t);
  fs.symlinkSync(f.proof,path.join(f.dir,'link.log'));
  assert.equal(await validHipicoPhysicalMaterial(f.manifest,[{...f.rows[0],path:'link.log'}]),false);
  assert.equal(await validHipicoPhysicalMaterial(f.manifest,[{...f.rows[0],path:'../outside.log'}]),false);
  assert.equal(await validHipicoPhysicalMaterial(f.manifest,[{...f.rows[0],path:f.proof}]),false);
});

test('#119 duplicate proof paths with different declared hashes fail closed',async t=>{
  const f=fixture(t);
  assert.equal(await validHipicoPhysicalMaterial(f.manifest,[...f.rows,{...f.rows[0],sha256:'b'.repeat(64)}]),false);
});

test('#119 rejects malformed or empty evidence manifests',async t=>{
  const f=fixture(t);
  for(const rows of [[],null,[{path:'device-proof.log',sha256:'bad'}]]){
    assert.equal(await validHipicoPhysicalMaterial(f.manifest,rows),false);
  }
});
