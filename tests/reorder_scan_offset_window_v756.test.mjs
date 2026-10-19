import test from 'node:test';
import assert from 'node:assert/strict';
import {reorderScanPageMeta, REORDER_SCAN_MAX_SKIP} from '../backend/src/modules/reports/reorder-scan-page.ts';

test('last usable offset can point exactly at the max bound', () => {
 const r=reorderScanPageMeta({skip:REORDER_SCAN_MAX_SKIP-1,take:1,scannedProducts:1,activeProducts:REORDER_SCAN_MAX_SKIP+1,matchesInPage:0});
 assert.equal(r.hasMore,true);assert.equal(r.nextSkip,REORDER_SCAN_MAX_SKIP);
});
test('beyond-limit continuation is rejected rather than handing unusable cursor', () => {
 assert.throws(()=>reorderScanPageMeta({skip:REORDER_SCAN_MAX_SKIP-1,take:3,scannedProducts:3,activeProducts:REORDER_SCAN_MAX_SKIP+5,matchesInPage:1}), /REORDER_SCAN_OFFSET_WINDOW_EXCEEDED/);
});
test('last page is allowed even if the catalog ends beyond maxSkip', () => {
 const r=reorderScanPageMeta({skip:REORDER_SCAN_MAX_SKIP,take:3,scannedProducts:3,activeProducts:REORDER_SCAN_MAX_SKIP+3,matchesInPage:1});
 assert.equal(r.hasMore,false);assert.equal(r.nextSkip,null);
});
test('empty and normal pages preserve existing metadata', () => {
 const empty=reorderScanPageMeta({skip:0,take:500,scannedProducts:0,activeProducts:0,matchesInPage:0});
 assert.equal(empty.hasMore,false); assert.equal(empty.nextSkip,null);
 const page=reorderScanPageMeta({skip:0,take:2,scannedProducts:2,activeProducts:4,matchesInPage:1});
 assert.equal(page.nextSkip,2);assert.equal(page.hasMore,true);
});
test('inconsistent page metadata remains fail-closed', () => {
 assert.throws(()=>reorderScanPageMeta({skip:0,take:5,scannedProducts:2,activeProducts:4,matchesInPage:0}), /INCONSISTENT_PAGE/);
});
