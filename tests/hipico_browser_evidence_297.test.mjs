import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { browserEvidence, writeBrowserEvidence } from '../scripts/hipico-browser-qa.mjs';

const candidate={candidate:'a'.repeat(40),branch:'feat/hipico',dirty:false,expected:'a'.repeat(40)};

test('browser evidence records exact candidate, Chromium suite and execution status',()=>{
  const evidence=browserEvidence({
    candidate,status:'PASS',exitCode:0,
    startedAt:'2026-09-11T20:00:00.000Z',finishedAt:'2026-09-11T20:01:00.000Z'
  });
  assert.equal(evidence.candidateSha,candidate.candidate);
  assert.equal(evidence.dirty,false);
  assert.equal(evidence.status,'PASS');
  assert.equal(evidence.project,'chromium');
  assert.equal(evidence.workers,1);
  assert.equal(evidence.suite,'qa/hipico-visual-functional-v105.spec.mjs');
});

test('browser evidence is written under the candidate SHA with a checksum',()=>{
  const root=mkdtempSync(join(tmpdir(),'hipico-browser-evidence '));
  const evidence=browserEvidence({
    candidate,status:'FAIL',exitCode:1,
    startedAt:'2026-09-11T20:00:00.000Z',finishedAt:'2026-09-11T20:01:00.000Z'
  });
  const path=writeBrowserEvidence(root,evidence);
  assert.match(path,new RegExp(candidate.candidate));
  const stored=JSON.parse(readFileSync(path,'utf8'));
  assert.equal(stored.status,'FAIL');
  const sums=readFileSync(join(root,'artifacts','qa','hipico-browser',candidate.candidate,'SHA256SUMS.txt'),'utf8');
  assert.match(sums,/^[0-9a-f]{64}\s+browser-e2e\.json\n$/);
});
