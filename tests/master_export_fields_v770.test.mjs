import test from 'node:test';
import assert from 'node:assert/strict';
import {MASTER_EXPORT_COLUMNS, projectMasterExportRows} from '../backend/src/modules/imports/master-export-fields.mjs';

test('#770 exports fixed customer/supplier/stock/account columns only',()=>{
  assert.deepEqual(MASTER_EXPORT_COLUMNS.inventory,
    ['sku','name','description','unit','cost','price','minStock','taxRate','barcode']);
  assert.ok(!MASTER_EXPORT_COLUMNS.inventory.includes('stock'));
  assert.ok(!MASTER_EXPORT_COLUMNS.inventory.includes('reserved'));
  assert.ok(!Object.hasOwn(MASTER_EXPORT_COLUMNS,'payroll'));
  assert.deepEqual(projectMasterExportRows('clients',[{id:'private',tenantId:'private',rif:'J123',name:'Cliente',email:'c@example.test'}]),
    [{rif:'J123',name:'Cliente',contact:'',email:'c@example.test',phone:'',address:'',fiscalType:''}]);
});

test('#770 preserves exact decimal and intentional formula text until CSV escaping',()=>{
  class Decimal {toString(){return '0.000000000012345678901234';}}
  const result=projectMasterExportRows('inventory',[{sku:'A1',name:'Name',description:'=1+1',cost:new Decimal()}]);
  assert.equal(result[0].cost,'0.000000000012345678901234');
  assert.equal(result[0].description,'=1+1');
});

test('#770 refuses unsupported records and unapproved data types',()=>{
  assert.throws(()=>projectMasterExportRows('payroll',[]),/MASTER_EXPORT_INVALID_INPUT/);
  assert.throws(()=>projectMasterExportRows('clients',new Array(501).fill({})),/MASTER_EXPORT_INVALID_INPUT/);
  assert.throws(()=>projectMasterExportRows('clients',[null]),/MASTER_EXPORT_INVALID_RECORD/);
  assert.throws(()=>projectMasterExportRows('clients',[{rif:{toString(){return 'secret';}}}]),/MASTER_EXPORT_UNSUPPORTED_VALUE/);
});
