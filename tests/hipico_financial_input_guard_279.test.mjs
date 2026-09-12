import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { __test__ } from '../frontend/public/hipico-control/assets/js/financial-config-guard.js';

test('advanced batch validation rejects nonpositive amounts and invalid race numbers', () => {
  assert.equal(__test__.validateAdvancedBatch('2026-09-11 | Parx | 4 | 1/2 | 5 | 12000 | cc | chivo'), null);
  assert.match(__test__.validateAdvancedBatch('2026-09-11 | Parx | 0 | 1/2 | 5 | 12000 | cc | chivo')?.message || '', /carrera inválida/i);
  assert.match(__test__.validateAdvancedBatch('2026-09-11 | Parx | 4 | 1/2 | 5 | 0 | cc | chivo')?.message || '', /monto inválido/i);
  assert.match(__test__.validateAdvancedBatch('2026-09-11 | Parx | 4 | 1/2 | 5 | -10 | cc | chivo')?.message || '', /monto inválido/i);
  assert.match(__test__.validateAdvancedBatch('bad | row')?.message || '', /faltan columnas/i);
});

test('positive monetary parser accepts existing K/M notation but rejects zero and negative values', () => {
  const input = (value) => ({ value });
  assert.equal(__test__.positiveParsedAmount(input('12K')), 12000);
  assert.equal(__test__.positiveParsedAmount(input('1,5K')), 1500);
  assert.equal(__test__.positiveParsedAmount(input('0')), null);
  assert.equal(__test__.positiveParsedAmount(input('-25')), null);
});

test('financial submit guard covers advanced and POLLA forms before app persistence handler', async () => {
  const source = await fs.readFile('frontend/public/hipico-control/assets/js/financial-config-guard.js', 'utf8');
  assert.match(source, /form\.id === 'advanced-form'/);
  assert.match(source, /form\.id === 'paste-advanced-form'/);
  assert.match(source, /form\.id === 'polla-form'/);
  assert.match(source, /percentValue < 0 \|\| percentValue > 100/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
});
