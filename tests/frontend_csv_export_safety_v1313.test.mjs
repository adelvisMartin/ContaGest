import assert from 'node:assert/strict';
import test from 'node:test';
import { toCsv } from '../frontend/src/services/csv.js';

test('#1313 local CSV rejects spreadsheet formulas in untrusted headings and values', () => {
  const csv = toCsv([{ '=1+1': '+SUM(1,2)', Name: '\t@HYPERLINK("https://example.invalid")' }]);
  assert.equal(csv.split('\n')[0], '"\'=1+1","Name"');
  assert.ok(csv.includes('"\'+SUM(1,2)"'));
  assert.ok(csv.includes('"\'\t@HYPERLINK(""https://example.invalid"")"'));
});

test('#1313 local CSV handles Unicode invisible prefixes and preserves legitimate numeric quantities', () => {
  const csv = toCsv([{ Name: '\uFEFF=1+1', Total: -125.5, Safe: 'Factura, "A"' }]);
  assert.ok(csv.includes('"\'\uFEFF=1+1"'));
  assert.ok(csv.includes('"-125.5"'));
  assert.ok(csv.includes('"Factura, ""A"""'));
});

test('#1313 local CSV keeps a quoted multiline field inside a single logical record', () => {
  assert.equal(toCsv([{ Description: 'Una línea\nOtra línea', Amount: 7 }]), '"Description","Amount"\n"Una línea\nOtra línea","7"');
  assert.equal(toCsv([]), '');
});
