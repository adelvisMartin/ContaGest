import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evidenceStatusesConflict } from '../scripts/hipico-evidence-status-consistency-v839.mjs';

const of = (status) => ({data:{status}});
const normalize = (data) => ['PASS','FAIL','BLOCKED','NOT_EXECUTED'].includes(data?.status) ? data.status : 'NOT_EXECUTED';

test('#839 exact-SHA reports with PASS and FAIL cannot select a passing artifact', () => {
  assert.equal(evidenceStatusesConflict([of('PASS'),of('FAIL')], normalize),true);
  assert.equal(evidenceStatusesConflict([of('PASS'),of('BLOCKED')], normalize),true);
  assert.equal(evidenceStatusesConflict([of('PASS'),of('NOT_EXECUTED')], normalize),true);
  assert.equal(evidenceStatusesConflict([of('PASS'),{}], normalize),true);
});
test('#839 matching same-status reports and single reports remain evaluable', () => {
  assert.equal(evidenceStatusesConflict([of('PASS'),of('PASS')], normalize),false);
  assert.equal(evidenceStatusesConflict([of('FAIL'),of('FAIL')], normalize),false);
  assert.equal(evidenceStatusesConflict([of('PASS')], normalize),false);
  assert.equal(evidenceStatusesConflict([], normalize),false);
});
test('#839 candidate selector invokes contradiction gate before picking a PASS', () => {
  const source=fs.readFileSync(new URL('../scripts/hipico-verify-evidence-v290.mjs',import.meta.url),'utf8');
  const guard=source.indexOf('evidenceStatusesConflict(schemaMatch, evidenceStatus)');
  const select=source.indexOf("schemaMatch.find((item) => evidenceStatus(item.data) === 'PASS')");
  assert.ok(guard>0 && select>guard);
  assert.match(source,/CONFLICTING_SAME_SHA_EVIDENCE/);
});
