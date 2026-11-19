import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  resolveStatementCsvHeaders as resolve,
  StatementCsvHeadersError,
} from '../backend/src/modules/bank-reconciliation/statement-csv-headers.ts';

const aliases = Object.freeze({
  date: ['date', 'fecha', 'bookedat', 'bookingdate'],
  valueDate: ['valuedate', 'fecha_valor', 'value_date'],
  amount: ['amount', 'monto', 'importe', 'valor'],
  reference: ['reference', 'referencia', 'ref', 'fitid'],
  id: ['id', 'bankid', 'bank_line_id', 'fitid'],
  memo: ['memo', 'description', 'descripcion', 'concepto'],
});

test('#743 maps each canonical bank field to the unique source column', () => {
  assert.deepEqual({ ...resolve(['Fecha', 'Monto', 'Referencia', 'Concepto'], aliases) }, {
    date: 0, valueDate: -1, amount: 1, reference: 2, id: -1, memo: 3,
  });
});

test('#743 accepts Spanish value-date aliases previously missed after normalization', () => {
  const indexes = resolve(['fecha', 'fecha_valor', 'monto', 'bank_line_id'], aliases);
  assert.equal(indexes.valueDate, 1);
  assert.equal(indexes.id, 3);
  assert.equal(indexes.amount, 2);
});

test('#743 refuses duplicate amount/date/reference aliases before any financial import', () => {
  for (const headers of [
    ['date', 'amount', 'monto'],
    ['fecha', 'date', 'amount'],
    ['date', 'amount', 'ref', 'referencia'],
    ['date', 'amount', 'valueDate', 'fecha_valor'],
    ['date', 'amount', 'bankid', 'bank_line_id'],
  ]) assert.throws(() => resolve(headers, aliases), StatementCsvHeadersError, headers.join(','));
});

test('#743 refuses repeated unknown metadata columns and normalized spelling collisions', () => {
  for (const headers of [
    ['date', 'amount', 'extra', 'EXTRA'],
    ['date', 'amount', 'campo-extra', 'campo_extra'],
    ['date', 'amount', ' ', 'memo'],
  ]) assert.throws(() => resolve(headers, aliases), StatementCsvHeadersError);
});

test('#743 permits one FITID column for both reference and id without duplicate-match false positive', () => {
  const indexes = resolve(['date', 'amount', 'FITID', 'other_metadata'], aliases);
  assert.equal(indexes.id, 2);
  assert.equal(indexes.reference, 2);
  assert.equal(indexes.amount, 1);
});

test('#743 existing CSV structure remains an independent RFC4180 parser', () => {
  const code = readFileSync(new URL('../backend/src/modules/bank-reconciliation/statement-csv-structure.ts', import.meta.url), 'utf8');
  assert.match(code, /parseStatementCsvRows/);
  assert.doesNotMatch(code, /resolveStatementCsvHeaders/);
});


test('#743 fails closed on invisible Unicode used to disguise bank column aliases', () => {
  const disguised = [
    'am\u200bount', 'am\u200count', 'am\u200dount',
    'am\u00adount', 'am\u034fount', 'am\u061count',
    '\u202eamount', 'amount\u2066', 'amount\u2069',
    'am\ufeffount', 'amount\ufeff', '\ufeffamount',
    'memo\u2028', 'memo\u0085',
  ];
  for (const alias of disguised) {
    assert.throws(() => resolve(['date', 'amount', alias], aliases), StatementCsvHeadersError, JSON.stringify(alias));
  }
});

test('#743 preserves a true first-column UTF-8 BOM and visible metadata names', () => {
  const normalized = resolve(['\ufeffFecha', 'Monto', 'Descripción adicional'], aliases);
  assert.equal(normalized.date, 0);
  assert.equal(normalized.amount, 1);
  const visible = resolve(['fecha_valor', 'fecha', 'monto', 'campo-extra'], aliases);
  assert.equal(visible.valueDate, 0);
  assert.equal(visible.date, 1);
  assert.equal(visible.amount, 2);
});
