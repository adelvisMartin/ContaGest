import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertXlsxZipBudget, assertXlsxZipEntryName, assertSafeImportXml } from '../frontend/src/services/xlsxZipBudget.mjs';

test('#770 accepts bounded XLSX entries',()=>{
  assert.equal(assertXlsxZipBudget({count:6,compressed:100,uncompressed:1000,total:2000}),3000);
});
test('#770 rejects oversized and corrupt ZIP claims',()=>{
  for(const item of [
    {count:1025,compressed:1,uncompressed:1,total:0},
    {count:2,compressed:1,uncompressed:33*1024*1024,total:0},
    {count:3,compressed:1,uncompressed:2*1024*1024,total:63*1024*1024},
    {count:3,compressed:-1,uncompressed:1,total:0},
    {count:3,compressed:1,uncompressed:NaN,total:0},
  ])assert.throws(()=>assertXlsxZipBudget(item),/XLSX excede/);
});
test('#770 XLSX parser enforces decompression budgets before accepting entries',()=>{
  const source=readFileSync(new URL('../frontend/src/services/dataImportService.js',import.meta.url),'utf8');
  assert.match(source,/assertXlsxZipBudget\(\{count,compressed,uncompressed,total:expanded\}\)/);
  assert.match(source,/inflateRaw\(compressedBytes,uncompressed\)/);
  assert.match(source,/content\.byteLength!==uncompressed/);
});

test('#770 ZIP member names are canonical and cannot traverse archive paths',()=>{
  for(const valid of ['[Content_Types].xml','xl/worksheets/sheet1.xml','xl/_rels/workbook.xml.rels'])
    assert.equal(assertXlsxZipEntryName(valid),valid);
  for(const invalid of ['../etc/passwd','xl/../etc/passwd','/etc/passwd','xl\\evil.xml','xl/./sheet.xml',''])
    assert.throws(()=>assertXlsxZipEntryName(invalid),{message:'XLSX_ZIP_ENTRY_NAME_INVALID'});
});
test('#770 ZIP central and local headers must agree before decompression',()=>{
  const source=readFileSync(new URL('../frontend/src/services/dataImportService.js',import.meta.url),'utf8');
  assert.match(source,/assertXlsxZipEntryName\(decoder\.decode/);
  assert.match(source,/u16\(view,localOffset\+6\)!==flags/);
  assert.match(source,/start\+compressed>eocd/);
});

test('#770 untrusted XLSX XML cannot declare DTD or entities',()=>{
  assert.equal(assertSafeImportXml('<worksheet><sheetData/></worksheet>'),'<worksheet><sheetData/></worksheet>');
  for(const malicious of ['<!DOCTYPE x><worksheet/>','<!ENTITY exfil SYSTEM "file:///etc/passwd">','<!doctype x [ <!entity test "x"> ]>'])
    assert.throws(()=>assertSafeImportXml(malicious),{message:'XLSX_XML_DTD_FORBIDDEN'});
  const source=readFileSync(new URL('../frontend/src/services/dataImportService.js',import.meta.url),'utf8');
  assert.match(source,/parseFromString\(assertSafeImportXml\(text\)/);
});
