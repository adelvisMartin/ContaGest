import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { MASTER_EXPORT_FIELDS, masterExportCell, masterExportRows, masterExportCsv, masterExportPayload } from '../backend/src/modules/exports/master-export.ts';

const meta = Object.freeze({ skip: 0, take: 100, hasMore: false, exportedAt: '2026-10-15T00:00:00.000Z' });

test('whitelists every exported field and never leaks tenant id, internal id or secrets', () => {
  const [row] = masterExportRows('clients', [{
    rif:'J123',name:'Sample',tenantId:'another-tenant',id:'internal-id',password:'secret',
    email:'sample@example.invalid',active:true,contact:null
  }]);
  assert.deepEqual(Object.keys(row), MASTER_EXPORT_FIELDS.clients);
  assert.equal(row.rif, 'J123');
  assert.equal(row.active, 'true');
  assert.equal(row.contact, null);
  for(const key of ['tenantId','id','password']) assert.equal(Object.hasOwn(row,key),false);
});

test('supplier and product projections differ and never include stock or reserved balances', () => {
  assert.equal(MASTER_EXPORT_FIELDS.suppliers.includes('retentionProfile'), true);
  const [product] = masterExportRows('products', [{sku:'P-1',stock:'999',reserved:'11',cost:'19.9900',price:'25.0000'}]);
  assert.equal(product.cost,'19.9900');
  assert.equal(product.price,'25.0000');
  assert.equal(Object.hasOwn(product,'stock'),false);
  assert.equal(Object.hasOwn(product,'reserved'),false);
});

test('preserves exact decimal string without floating point conversion', () => {
  const dec = {toString:()=> '999999999999.123456789'};
  assert.equal(masterExportCell(dec),'999999999999.123456789');
  assert.equal(masterExportCell(false),'false');
  assert.equal(masterExportCell(new Date('2025-01-02T03:04:05Z')),'2025-01-02T03:04:05.000Z');
});

test('fails closed on unsupported object values instead of serializing arbitrary data', () => {
  assert.throws(()=>masterExportCell({secret:'token'}),/Unsupported/);
  assert.throws(()=>masterExportCell(['admin']),/Unsupported/);
});

test('CSV quoting encodes commas, quotes and multiline values according to RFC4180', () => {
  const result = masterExportCsv('clients', [{rif:'J-1',name:'one,"two"\r\nthree'}]);
  assert.match(result, /"one,""two""\r\nthree"/);
  assert.ok(result.startsWith('"rif","name"'));
});

test('neutralizes spreadsheet formulas even after whitespace/control prefixes', () => {
  const csv = masterExportCsv('clients', [{rif:'=1+1',name:'\t@SUM(A1:A2)',email:' +HYPERLINK("x")'}]);
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\'\t@SUM(A1:A2)"'));
  assert.ok(csv.includes('"\' +HYPERLINK(""x"")"'));
});

test('CSV header and row keys stay in declared canonical order', () => {
  const csv = masterExportCsv('products', [{price:'2.30',sku:'AAA',tenantId:'FORGED'}]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], MASTER_EXPORT_FIELDS.products.map(v=>'"'+v+'"').join(','));
  assert.equal(lines[1].split(',').length, MASTER_EXPORT_FIELDS.products.length);
  assert.equal(csv.includes('FORGED'), false);
});

test('JSON payload has version and provenance but excludes raw internal fields', () => {
  const result=masterExportPayload('clients','json',[{rif:'J-2',name:'Customer',secret:'no',tenantId:'B'}],meta);
  const data=JSON.parse(result.data);
  assert.equal(data.schemaVersion,1);
  assert.equal(data.source,'contagest:server');
  assert.equal(data.entity,'clients');
  assert.equal(data.rows[0].rif,'J-2');
  assert.equal(data.rows[0].tenantId,undefined);
  assert.equal(result.count,1);
  assert.match(result.sha256,/^[a-f0-9]{64}$/);
});

test('export hashes are reproducible for identical source and recorded snapshot timestamp', () => {
  const rows=[{rif:'J-4',name:'Consistent'}];
  const a=masterExportPayload('clients','json',rows,meta);
  const b=masterExportPayload('clients','json',rows,meta);
  assert.equal(a.sha256,b.sha256);
  const c=masterExportPayload('clients','json',rows,{...meta,exportedAt:'2026-10-15T01:00:00Z'});
  assert.notEqual(a.sha256,c.sha256);
});

test('pagination cursor reflects exported page only when more data exists', () => {
  const page=masterExportPayload('clients','csv',[{rif:'J-4',name:'A'},{rif:'J-5',name:'B'}],{...meta,skip:20,take:2,hasMore:true});
  assert.equal(page.nextSkip,22);
  assert.equal(page.count,2);
  assert.equal(masterExportPayload('clients','csv',[],meta).nextSkip,null);
});

test('source route binds tenant to DB predicates and uses per-entity permission gates', () => {
  const route=readFileSync(new URL('../backend/src/modules/exports/exports.routes.ts',import.meta.url),'utf8');
  assert.match(route,/router\.get\('\/masters\/clients', requirePermission\('clients\.manage'\)/);
  assert.match(route,/router\.get\('\/masters\/suppliers', requirePermission\('purchases\.manage'\)/);
  assert.match(route,/router\.get\('\/masters\/products', requirePermission\('inventory\.manage'\)/);
  assert.match(route,/where: \{tenantId:ctx\.tenantId\}/);
  assert.match(route,/tx\.auditLog\.create/);
  assert.match(route,/no-store/);
});
