import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStatementCsvRows as parse, StatementCsvStructureError} from '../backend/src/modules/bank-reconciliation/statement-csv-structure.ts';

test('unquoted bank statement rows preserve all columns',()=>{
  assert.deepEqual(parse('date,amount,reference\n2026-10-16,12.00,ABC\n'),[
    ['date','amount','reference'],['2026-10-16','12.00','ABC']]);
});
test('quoted delimiters, escaped quotes and newlines roundtrip',()=>{
  assert.deepEqual(parse('date,memo\r\n2026-10-16,"Pago, transferencia"\r\n2026-10-17,"Dijo ""ok""\ny siguió"'),[
    ['date','memo'],['2026-10-16','Pago, transferencia'],['2026-10-17','Dijo "ok"\ny siguió']]);
});
test('blank lines do not create bank movements',()=>{
  assert.deepEqual(parse('\n\r\ndate,amount\n\n2026-10-16,10\n'),[['date','amount'],['2026-10-16','10']]);
});
test('malformed unclosed quotes fail closed',()=>{
  assert.throws(()=>parse('date,memo\n2026-10-16,"unclosed'),StatementCsvStructureError);
});
test('embedded quote in unquoted value is rejected',()=>{
  assert.throws(()=>parse('date,memo\n2026-10-16,ab"cd'),StatementCsvStructureError);
});
test('data after closing quote is rejected instead of silently changing amounts',()=>{
  for(const value of ['"100"0','"100" x','"100"\t']) assert.throws(()=>parse(`amount\n${value}`),StatementCsvStructureError);
});
test('quoted value cannot start after unquoted characters',()=>{
  assert.throws(()=>parse('memo\nabc"def"'),StatementCsvStructureError);
});
test('empty quoted cell and final comma remain distinguishable',()=>{
  assert.deepEqual(parse('date,memo,reference\n2026-10-16,"",'),[
    ['date','memo','reference'],['2026-10-16','','']]);
});
test('empty input does not imply transactions',()=>{
  assert.deepEqual(parse(''),[]);
});
