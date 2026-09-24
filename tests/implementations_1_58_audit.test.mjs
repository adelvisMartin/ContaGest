import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const manifest=JSON.parse(fs.readFileSync('config/implementation-roadmap-1-58.json','utf8'));
const rows=manifest.implementations;

test('implementation audit owns exactly 1 through 58 without gaps or duplicates',()=>{
  assert.equal(rows.length,58);
  assert.deepEqual(rows.map((row)=>row.id),Array.from({length:58},(_,index)=>index+1));
  assert.equal(new Set(rows.map((row)=>row.id)).size,58);
});

test('every implementation binds authoritative PRs owners and regressions',()=>{
  for(const row of rows){
    assert.ok(row.prs.length>0,`${row.id}: PR`);
    assert.ok(row.ownerPaths.length>0,`${row.id}: owner`);
    assert.ok(row.regressionPaths.length>0,`${row.id}: regression`);
    for(const path of [...row.ownerPaths,...row.regressionPaths]){
      assert.ok(fs.existsSync(path),`${row.id}: ${path}`);
    }
  }
});

test('superseded concurrent PRs are not restored as implementation authorities',()=>{
  const superseded=new Set(manifest.rules.supersededDoNotRestore);
  for(const row of rows){
    for(const pr of row.prs) assert.equal(superseded.has(pr),false,`${row.id}: superseded PR #${pr}`);
  }
});

test('Clean Code batch 1 is explicitly traceable to affected vertical implementations',()=>{
  const reviewed=rows.filter((row)=>row.reviewStatus==='CLEAN_CODE_BATCH_1').map((row)=>row.id);
  assert.deepEqual(reviewed,[26,27,28,29,30,31,32,37,38,39,40]);
});
