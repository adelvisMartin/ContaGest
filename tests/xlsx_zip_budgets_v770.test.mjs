import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertXlsxZipBudget, assertXlsxZipEntryName, assertSafeImportXml, assertZipCrc32 } from '../frontend/src/services/xlsxZipBudget.mjs';

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

test('#770 ZIP CRC32 catches mutated XML payload before parsing',()=>{
  const correct=new TextEncoder().encode('123456789');
  assert.equal(assertZipCrc32(correct,0xcbf43926),true);
  assert.equal(assertZipCrc32(new Uint8Array(),0),true);
  assert.throws(()=>assertZipCrc32(new TextEncoder().encode('12345678x'),0xcbf43926),/XLSX_ZIP_CRC_MISMATCH/);
  assert.throws(()=>assertZipCrc32(correct,null),/XLSX_ZIP_CRC_MISMATCH/);
  const service=readFileSync(new URL('../frontend/src/services/dataImportService.js',import.meta.url),'utf8');
  assert.match(service,/assertZipCrc32\(content,crc\)/);
});

test('#1391 refuses XLSX macros, OLE, external connections and uninspected relationships',()=>{
  for(const malicious of [
    'xl/vbaProject.bin','xl/vbaProjectSignature.bin','xl/activeX/activeX1.bin',
    'xl/embeddings/oleObject1.bin','xl/externalLinks/externalLink1.xml',
    'xl/connections.xml','xl/queryTables/queryTable1.xml',
    'xl/webExtensions/webextension1.xml','customUI/customUI.xml',
    'xl/worksheets/_rels/sheet1.xml.rels'
  ]) assert.throws(()=>assertXlsxZipEntryName(malicious),{message:'XLSX_UNTRUSTED_CONTENT'});
  assert.equal(assertXlsxZipEntryName('xl/worksheets/sheet1.xml'),'xl/worksheets/sheet1.xml');
  assert.equal(assertXlsxZipEntryName('xl/_rels/workbook.xml.rels'),'xl/_rels/workbook.xml.rels');
});
