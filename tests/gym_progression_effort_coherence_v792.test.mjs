import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const domain = fs.readFileSync('backend/src/modules/verticals/gym.progression.ts', 'utf8');
const schema = fs.readFileSync('backend/src/modules/verticals/gym.schemas.ts', 'utf8');
const begin = domain.indexOf('export const isRirRpePairCoherent = ');
const finish = domain.indexOf('export function gymProgressionConfigIssues', begin);
assert.ok(begin >= 0 && finish > begin);
const section = domain.slice(begin, finish)
  .replace('export const ', 'const ')
  .replace('(rir?: number | null, rpe?: number | null)', '(rir, rpe)');
const coherent = new Function(section + ';return isRirRpePairCoherent;')();

test('consistent performed RIR and RPE', () => {
  assert.equal(coherent(2,8),true);
  assert.equal(coherent(2,8.5),true);
});
test('contradictory effort cannot recommend progression', () => {
  for (const [rir,rpe] of [[0,6],[4,9],[8,8],[1,5]]) assert.equal(coherent(rir,rpe),false);
});
test('one missing effort dimension does not manufacture evidence', () => {
  assert.equal(coherent(null,7),true);
  assert.equal(coherent(2,null),true);
});
test('route schema validates actual evidence through canonical domain helper', () => {
  assert.ok(schema.includes('isRirRpePairCoherent(value.performance.rir, value.performance.rpe)'));
  assert.ok(schema.includes("path:['performance','rpe']"));
  assert.ok(schema.includes('gymProgressionConfigIssues(value.strategy'));
});
