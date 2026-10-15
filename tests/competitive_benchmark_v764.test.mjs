import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCompetitiveBenchmark } from '../scripts/verify-competitive-benchmark-v764.mjs';

const original = JSON.parse(readFileSync(new URL('../config/competitive-benchmark-v764.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(original);
test('all selected products have source, classification and issue mapping', () => {
  assert.deepEqual(validateCompetitiveBenchmark(original), []);
  assert.equal(original.sources.length, 13);
  assert.ok(original.features.length >= 20);
});
test('rejects duplicate feature identifiers', () => {
  const copy = clone(); copy.features[1].id = copy.features[0].id;
  assert.match(validateCompetitiveBenchmark(copy).join(';'), /duplicate feature/);
});
test('rejects bogus runtime PASS', () => {
  const copy = clone(); copy.candidateEvidence = 'PASS';
  assert.match(validateCompetitiveBenchmark(copy).join(';'), /unsubstantiated PASS/);
});
test('rejects unreviewed GPL or proprietary source copying', () => {
  const copy = clone(); copy.features[0].sourceReuse = 'COPY';
  assert.match(validateCompetitiveBenchmark(copy).join(';'), /unsafe implementation strategy/);
});
test('rejects vendor with no source evidence', () => {
  const copy = clone(); copy.sources[0].sourceUrl = 'http://example.com';
  assert.match(validateCompetitiveBenchmark(copy).join(';'), /HTTPS provenance/);
});
test('unresolved vendor cannot create fabricated backlog work', () => {
  const copy = clone(); const target = copy.features.find(x => x.productId === 'ecologic');
  target.status = 'MISSING'; target.ownerIssue = 777;
  assert.match(validateCompetitiveBenchmark(copy).join(';'), /unresolved vendor incorrectly actionable/);
});
test('invalid issue owner fails closed', () => {
  const copy = clone(); copy.features[0].ownerIssue = null;
  assert.match(validateCompetitiveBenchmark(copy).join(';'), /gap without issue owner/);
});
test('rejects claimed license without attributable evidence', () => {
  const copy = clone(); copy.sources.find(x => x.id === 'akaunting').licenseEvidenceUrl = null;
  assert.match(validateCompetitiveBenchmark(copy).join(';'), /licensed source lacks evidence/);
});
test('unsupported reference feature claims fail closed', () => {
  const copy = clone(); const row = copy.features.find(x => x.id === 'VEOSS-013');
  row.referenceEvidenceLevel = 'DOCUMENTED';
  assert.match(validateCompetitiveBenchmark(copy).join(';'), /unsupported reference feature claim/);
});
test('unresolved reference cannot be upgraded without resolving vendor identity', () => {
  const copy = clone(); const row = copy.features.find(x => x.productId === 'ecologic');
  row.referenceEvidenceLevel = 'DOCUMENTED'; row.referenceEvidenceUrl = 'https://example.org';
  assert.match(validateCompetitiveBenchmark(copy).join(';'), /unsupported reference feature claim|reference identity\/evidence mismatch/);
});
test('provisional reference cannot imply a documented official claim', () => {
  const copy = clone(); const row = copy.features.find(x => x.id === 'VEOSS-009');
  row.referenceEvidenceUrl = 'https://example.org';
  assert.match(validateCompetitiveBenchmark(copy).join(';'), /unverified reference cannot carry evidence URL/);
});
