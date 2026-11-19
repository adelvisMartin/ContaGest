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
    '\ufeff  @SUM(1,2)', '\u00a0-5', '\u2007+1', '\u200b=2', '\u2060+1', '\r\n=1+1', '\u0085=1'
  ]) {
    const encoded = encodeCsvCell(payload);
    assert.equal(encoded, `"'${payload.replaceAll('"', '""')}"`, JSON.stringify(payload));
  }
});

test('zero-width Unicode prefixes cannot hide spreadsheet formulas', () => {
  for (const prefix of ['\u00ad', '\u034f', '\u061c', '\u180e', '\u2800', '\u3164', '\ufe0f', '\uffa0']) {
    const formula = prefix + '=HYPERLINK("https://example.invalid")';
    assert.equal(encodeCsvCell(formula), `"'${formula.replaceAll('"', '""')}"`);
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

test('legacy CSV service named export remains available after extraction', async () => {
  const service = await import('../frontend/src/services/csv.js');
  const util = await import('../frontend/src/utils/csvFormulaGuard.js');
  assert.equal(service.neutralizeSpreadsheetFormula, util.neutralizeSpreadsheetFormula);
});

test('shared CSV policy guards invisible prefixes and retains typed numeric cells', async () => {
  const { neutralizeSpreadsheetFormula } = await import('../frontend/src/utils/csvFormulaGuard.js');
  for (const input of [
    '=HYPERLINK("https://invalid.example")', '+SUM(A1)', '-2+3', '@SUM(A1)',
    '\t=1+1', '\r\n+SUM(A1)', '\u00a0-1', '\u00ad=1', '\u034f+1',
    '\u061c=1', '\u180e@1', '\u200b=1', '\u200f+1', '\u202e@1',
    '\u2060=1', '\u2800=1', '\u3164-1', '\ufe0f+1', '\ufeff@1', '\uffa0=1'
  ]) {
    assert.equal(neutralizeSpreadsheetFormula(input), `'${input}`, JSON.stringify(input));
    assert.equal(encodeCsvCell(input), `"'${input.replaceAll('"','""')}"`, JSON.stringify(input));
  }
  for(const input of ['Cliente C.A.','  Datos','José','0.00'," '1+1"]) {
    assert.equal(neutralizeSpreadsheetFormula(input), input);
  }
  assert.equal(neutralizeSpreadsheetFormula(-125.5), '-125.5');
  assert.equal(neutralizeSpreadsheetFormula(-125n), '-125');
  assert.equal(neutralizeSpreadsheetFormula('-125.5'), "'-125.5");
});
