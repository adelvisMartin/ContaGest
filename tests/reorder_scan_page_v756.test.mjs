import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  REORDER_SCAN_CONSISTENCY, REORDER_SCAN_DEFAULT_TAKE,
  REORDER_SCAN_MAX_SKIP, REORDER_SCAN_MAX_TAKE,
  parseReorderScanQuery, reorderScanPageMeta
} from '../backend/src/modules/reports/reorder-scan-page.ts';

const page = (data={}) => reorderScanPageMeta({
  skip:0, take:2, scannedProducts:2, activeProducts:5, matchesInPage:1, ...data
});

test('defaults preserve existing inventory reorder page size and no filtering', () => {
  assert.deepEqual(parseReorderScanQuery({}), {take:500,skip:0,onlyNeedsReorder:false});
  assert.equal(REORDER_SCAN_DEFAULT_TAKE,500);
});
test('explicit paging and legacy case-insensitive filter parse deterministically', () => {
  assert.deepEqual(parseReorderScanQuery({take:'12',skip:'24',onlyNeedsReorder:'TRUE'}),
    {take:12,skip:24,onlyNeedsReorder:true});
  assert.equal(parseReorderScanQuery({onlyNeedsReorder:'False'}).onlyNeedsReorder,false);
});
test('valid boundary values and no implicit numeric strings', () => {
  assert.equal(parseReorderScanQuery({take:String(REORDER_SCAN_MAX_TAKE),skip:String(REORDER_SCAN_MAX_SKIP)}).skip,1_000_000);
  assert.equal(parseReorderScanQuery({take:'1',skip:'0'}).take,1);
  for(const query of [{take:'1e3'},{take:'1.0'},{take:' 3 '},{take:'0'},{take:'1001'},
    {skip:'-1'},{skip:'1000001'},{skip:'Infinity'},{skip:'0001'},
    {skip:'999999999999999999999999999'}]) assert.throws(()=>parseReorderScanQuery(query));
});
test('multi-value query objects, malformed booleans and extra keys are rejected',()=>{
  for(const query of [{take:['20','40']},{skip:{a:1}},{onlyNeedsReorder:1},
    {onlyNeedsReorder:'yes'},{onlyNeedsReorder:['true']},{tenantId:'tenant-b'},
    {sort:'stock'}, {onlyNeedsReorder:' true'}, null, []])
    assert.throws(()=>parseReorderScanQuery(query));
});
test('first catalog scan page admits more even if few matches',()=>{
  assert.deepEqual(page(), {
    skip:0,take:2,scannedProducts:2,totalActiveProducts:5,matchesInPage:1,
    hasMore:true,nextSkip:2,truncated:true,pageScoped:true,
    consistency:REORDER_SCAN_CONSISTENCY,matchingScope:'SCANNED_CATALOG_PAGE_ONLY'
  });
});
test('empty matched results do not imply end of catalog',()=>{
  const info=page({matchesInPage:0});
  assert.equal(info.hasMore,true);
  assert.equal(info.nextSkip,2);
  assert.equal(info.matchesInPage,0);
});
test('middle page retains truthful partial-result metadata',()=>{
  const info=page({skip:2,scannedProducts:2,matchesInPage:2});
  assert.equal(info.nextSkip,4);
  assert.equal(info.truncated,true);
  assert.equal(info.totalActiveProducts,5);
});
test('final partial page is not marked complete tenant scan if prior pages exist',()=>{
  const info=page({skip:4,scannedProducts:1,matchesInPage:1});
  assert.equal(info.hasMore,false);
  assert.equal(info.nextSkip,null);
  assert.equal(info.truncated,true);
});
test('single-page catalog is complete, no further page',()=>{
  const info=page({activeProducts:2,scannedProducts:2,matchesInPage:2});
  assert.equal(info.hasMore,false);
  assert.equal(info.truncated,false);
});
test('out-of-range empty page is explicit and stops',()=>{
  const info=page({skip:8,scannedProducts:0,matchesInPage:0});
  assert.equal(info.hasMore,false);
  assert.equal(info.truncated,true);
});
test('database count/page disagreements cannot produce deceptive pagination',()=>{
  for(const bad of [
    {activeProducts:9,skip:1,scannedProducts:0},
    {activeProducts:9,skip:1,scannedProducts:1},
    {activeProducts:5,skip:4,scannedProducts:2},
    {matchesInPage:3}, {matchesInPage:-1}, {take:0},
    {activeProducts:-1}, {scannedProducts:3}, {skip:-1}
  ]) assert.throws(()=>page(bad), /REORDER_SCAN_INCONSISTENT_PAGE/);
});
test('pagination is a live request snapshot, not a durable server cursor',()=>{
  assert.equal(page().consistency,'REQUEST_SNAPSHOT_ONLY');
  assert.equal(page().matchingScope,'SCANNED_CATALOG_PAGE_ONLY');
});
test('route: authenticated scoped snapshot and no automatic stock writes',()=>{
  const text=readFileSync(new URL('../backend/src/modules/reports/reports.routes.ts',import.meta.url),'utf8');
  const segment=text.slice(text.indexOf("router.get('/inventory/reorder'"),text.indexOf("router.get('/taxes'"));
  assert.match(text,/router\.use\(requireTenant, requirePermission\('reports.view'\)\)/);
  assert.match(segment,/parseReorderScanQuery\(scanParams\)/);
  assert.match(segment,/const \{ includeSalesEvidence, salesWindowDays, leadTimeDays, \.\.\.scanParams \} = req\.query/);
  assert.match(segment,/tenantId: ctx\.tenantId/);
  assert.match(segment,/Prisma\.TransactionIsolationLevel\.RepeatableRead/);
  assert.match(segment,/skip,/);
  assert.match(segment,/reorderScanPageMeta\(/);
  assert.match(segment,/autoPurchaseEnabled: false/);
  assert.doesNotMatch(segment,/\.create\(|\.update\(|\.delete\(/);
});
