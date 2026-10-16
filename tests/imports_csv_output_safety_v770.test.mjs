import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeImportReportCsvCell as cell } from '../backend/src/modules/imports/import-report-csv-cell.ts';
import { previewProductCsvImport } from '../backend/src/modules/portability/product-csv-import-preview.mjs';
test('#770 spreadsheet formula prefixes are quoted as literal CSV cells',()=>{
  for(const v of ['=1+1','+SUM(1,2)','-2+3','@SUM(A1)'])
    assert.equal(cell(v),'"\\''+v+'"');
});
test('#770 spaces and tabs cannot bypass spreadsheet formula guard',()=>{
  for(const v of [' =1+1','  @cmd','\t=SUM(1)','\r\n+SUM(2)','\u00a0-42','\ufeff=HYPERLINK(1)'])
    assert.match(cell(v),/^"'/);
});
test('#770 newlines and controls do not create additional CSV records',()=>{
  const v=cell('mensaje\n=SUM(1)\r\nfin\0');
  assert.ok(!/[\r\n\0]/.test(v));assert.equal(v,'"mensaje =SUM(1)  fin "');
});
test('#770 field double-quotes remain RFC-4180 escaped',()=>{
  assert.equal(cell('a"b,c'),'"a""b,c"');
  assert.equal(cell('Producto seguro'),'"Producto seguro"');
});
test('#770 product CSV adapter is read-only, tenant-scoped and rejects data mutation columns',()=>{
  const result=previewProductCsvImport({tenantId:'tenant-A',actorTenantId:'tenant-A',entity:'products',csv:'sku,name\nX1,Producto X'});
  assert.equal(result.committable,false);assert.equal(result.persisted,false);
  assert.equal(result.requiresTenantCatalogDedupe,true);
  assert.throws(()=>previewProductCsvImport({tenantId:'tenant-A',actorTenantId:'tenant-B',entity:'products',csv:'sku,name\nX1,Producto X'}),/SCOPE/);
  assert.throws(()=>previewProductCsvImport({tenantId:'tenant-A',actorTenantId:'tenant-A',entity:'products',csv:'sku,name,stock\nX1,Producto X,3'}),/HEADERS/);
});
