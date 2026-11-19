import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStatementCsvRows as parse, StatementCsvStructureError, MAX_STATEMENT_CSV_COLUMNS, MAX_STATEMENT_CSV_ROWS, MAX_STATEMENT_CSV_FIELDS, MAX_STATEMENT_CSV_FIELD_CHARS} from '../backend/src/modules/bank-reconciliation/statement-csv-structure.ts';

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

test('bank CSV bounds quoted/unquoted fields without silently truncating money',()=>{
  assert.equal(parse('"'+'x'.repeat(MAX_STATEMENT_CSV_FIELD_CHARS)+'"')[0][0].length,MAX_STATEMENT_CSV_FIELD_CHARS);
  for(const data of [
    'x'.repeat(MAX_STATEMENT_CSV_FIELD_CHARS+1),
    '"'+'x'.repeat(MAX_STATEMENT_CSV_FIELD_CHARS+1)+'"',
    '"'+'""'.repeat(MAX_STATEMENT_CSV_FIELD_CHARS+1)+'"'
  ]){
    assert.throws(()=>parse(data),(error)=>error instanceof StatementCsvStructureError && error.code==='BANK_STATEMENT_CSV_LIMIT_EXCEEDED');
  }
});
test('bank CSV rejects excessive columns and rows before building unbounded arrays',()=>{
  assert.equal(parse('x,'.repeat(MAX_STATEMENT_CSV_COLUMNS-1)+'x')[0].length,MAX_STATEMENT_CSV_COLUMNS);
  assert.throws(()=>parse('x,'.repeat(MAX_STATEMENT_CSV_COLUMNS)+'x'),(error)=>error instanceof StatementCsvStructureError && error.code==='BANK_STATEMENT_CSV_LIMIT_EXCEEDED');
  assert.throws(()=>parse('a\n'.repeat(MAX_STATEMENT_CSV_ROWS+1)),(error)=>error instanceof StatementCsvStructureError && error.code==='BANK_STATEMENT_CSV_LIMIT_EXCEEDED');
});
test('bank CSV global field budget limits delimiter amplification',()=>{
  const fieldsPerLine=21;
  const row='x,'.repeat(fieldsPerLine-1)+'x\n';
  assert.throws(()=>parse(row.repeat(Math.floor(MAX_STATEMENT_CSV_FIELDS/fieldsPerLine)+1)),
    (error)=>error instanceof StatementCsvStructureError && error.code==='BANK_STATEMENT_CSV_LIMIT_EXCEEDED');
});
