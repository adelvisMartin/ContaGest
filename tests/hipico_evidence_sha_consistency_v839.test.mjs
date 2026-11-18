import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { consistentEvidenceSha, evidenceMentionsSha } from '../scripts/hipico-evidence-sha-consistency-v839.mjs';

const HEAD = 'a'.repeat(40);
const OLD = 'b'.repeat(40);

test('#839 consistent aliases resolve to the same exact candidate', () => {
  assert.equal(consistentEvidenceSha({sha:HEAD}), HEAD);
  assert.equal(consistentEvidenceSha({candidateSha:HEAD}), HEAD);
  assert.equal(consistentEvidenceSha({buildCommit:HEAD}), HEAD);
  assert.equal(consistentEvidenceSha({sha:HEAD.toUpperCase(), candidateSha:HEAD, buildCommit:HEAD}), HEAD);
});
test('#839 stale or malformed extra aliases cannot be hidden behind a valid SHA', () => {
  for (const row of [
    {sha:HEAD, candidateSha:OLD},
    {sha:OLD, candidateSha:HEAD},
    {sha:HEAD, buildCommit:OLD},
    {sha:HEAD, candidateSha:''},
    {sha:HEAD, candidateSha:null},
    {sha:HEAD, buildCommit:'not-a-commit'},
    {sha:HEAD, candidateSha:HEAD + '0'},
    {sha:HEAD, buildCommit:undefined},
    {},
    null,
    []
  ]) assert.equal(consistentEvidenceSha(row), '');
});
test('#839 contradictory report still claims current SHA and must enter the conflict gate', () => {
  assert.equal(evidenceMentionsSha({sha:HEAD,candidateSha:OLD},HEAD),true);
  assert.equal(evidenceMentionsSha({sha:OLD,candidateSha:HEAD},HEAD),true);
  assert.equal(evidenceMentionsSha({sha:OLD,candidateSha:OLD},HEAD),false);
  assert.equal(evidenceMentionsSha({sha:HEAD,buildCommit:OLD},HEAD),true);
  assert.equal(evidenceMentionsSha(null,HEAD),false);
});
test('#839 verifier rejects inconsistent aliases before selecting a PASS candidate', () => {
  const source=fs.readFileSync(new URL('../scripts/hipico-verify-evidence-v290.mjs',import.meta.url),'utf8');
  const observed=source.indexOf('evidenceMentionsSha(item.data, sha)');
  const guard=source.indexOf('EVIDENCE_SHA_FIELDS_CONFLICT');
  const selected=source.indexOf("schemaMatch.find((item) => evidenceStatus(item.data) === 'PASS')");
  assert.ok(observed>0 && guard>observed && selected>guard);
  assert.match(source,/consistentEvidenceSha\(selected\.data\) !== sha/);
});
