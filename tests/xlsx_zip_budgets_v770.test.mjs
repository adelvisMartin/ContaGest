import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertXlsxZipBudget } from '../frontend/src/services/xlsxZipBudget.mjs';

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
