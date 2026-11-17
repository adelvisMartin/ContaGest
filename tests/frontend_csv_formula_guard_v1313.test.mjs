import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encodeCsvCell, toCsv } from '../frontend/src/services/csv.js';

test('quotes all headers and values so commas, quotes, newlines cannot alter columns', () => {
  const csv = toCsv([{ 'account,"id"': 'one,"two"\r\nthree', note: 'ok' }]);
  assert.equal(csv, '"account,""id""","note"\r\n"one,""two""\r\nthree","ok"');
});

test('neutralizes formula prefixes after whitespace, BOM and C0/C1 controls', () => {
  for (const payload of [
    '=HYPERLINK("https://invalid.example","open")',
    '+SUM(A1:A2)', '-CMD', '@SUM(1,2)', '\t=1+1',
    '\ufeff  @SUM(1,2)', '\u00a0-5', '\u2007+1', '\r\n=1+1', '\u0085=1'
  ]) {
    const encoded = encodeCsvCell(payload);
    assert.equal(encoded, `"'${payload.replaceAll('"', '""')}"`, JSON.stringify(payload));
  }
});

test('numeric values are not turned into formulas or strings, and null remains empty', () => {
  assert.equal(toCsv([{ balance: -125.5, amount: 123n, empty: null, text: '-125.5' }]),
    '"balance","amount","empty","text"\r\n"-125.5","123","","\'-125.5"');
});

test('malicious column names are guarded; safe data and zero rows remain stable', () => {
  assert.equal(toCsv([{ '=SUM(A1:A2)': 'safe' }]), '"\'=SUM(A1:A2)"\r\n"safe"');
  assert.equal(encodeCsvCell('ordinary "quoted"'), '"ordinary ""quoted"""');
  assert.equal(toCsv([]), '');
});
