import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDelimitedImport} from '../frontend/src/services/delimitedImportParser.mjs';

test('#770 parses quotes, escaped quotes, CRLF and multiline CSV',()=>{
 assert.deepEqual(parseDelimitedImport('sku,name,description\r\nA,"Product, One","A ""quoted""\nline"\r\n'),
 [{sku:'A',name:'Product, One',description:'A "quoted"\nline'}]);
});
test('#770 supports BOM and quoted TSV',()=>{
 assert.deepEqual(parseDelimitedImport('\ufeffsku\tname\nA\t"One\tTwo"','\t'),[{sku:'A',name:'One\tTwo'}]);
});
test('#770 malformed headers, rows, and quotes cannot reach preview',()=>{
 for(const csv of ['sku,name\na,"unterminated','sku,name\na,va"lue','sku,name\na,"b"garbage',
  'sku,SKU\na,b','sku,name\na,b,c','sku,name\na','sku,\na,b'])
   assert.throws(()=>parseDelimitedImport(csv), /IMPORT_DELIMITED_/);
});
test('#770 bounds cells and rows before mapping untrusted data',()=>{
 assert.throws(()=>parseDelimitedImport('sku,name\nA,'+'x'.repeat(8193)),/CELL_TOO_LONG/);
 assert.throws(()=>parseDelimitedImport('sku,name\n'+'A,B\n'.repeat(5001)),/TOO_MANY_ROWS/);
});


test('#770 deterministic 10k quoted CSV samples preserve data without column drift',()=>{
 let seed=0x7702026;
 const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 const chars=['a','B','0',' ', ',', '"','\n','\r','\t'];
 for(let i=0;i<10000;i++){
  let value='';
  const count=1+next()%28;
  for(let j=0;j<count;j++)value+=chars[next()%chars.length];
  const csv='sku,description\\nSKU-'+i+',"'+value.replaceAll('"','""')+'"\\n';
  const rows=parseDelimitedImport(csv);
  assert.deepEqual(rows,[{sku:'SKU-'+i,description:value.trim()}], 'case '+i);
 }
});
