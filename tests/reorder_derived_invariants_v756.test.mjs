import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveReorderCandidates, inspectReorderStockRows, prepareReorderStockPage } from '../backend/src/modules/reports/replenishment-candidates.ts';

const row = (overrides = {}) => ({
  productId:'id-a',sku:'SKU-A',name:'Producto',unit:'UND',
  stockExact:'5.000',reservedExact:'3.000',availableExact:'2.000',
  minStockExact:'4.000',shortfallExact:'2.000',
  status:'below_minimum',needsReorder:true,...overrides
});

test('canonical below-minimum row remains a manual review candidate',()=>{
  const r=prepareReorderStockPage([row()]);
  assert.equal(r.reorderCandidates[0].minShortfallExact,'2.000');
  assert.deepEqual(r.salesCandidateIds,['id-a']);
});
test('shortfall cannot overstate the actual deficit',()=>{
  assert.throws(()=>inspectReorderStockRows([row({shortfallExact:'2.001'})]),/REORDER_SHORTFALL_MISMATCH/);
});
test('shortfall cannot understate the actual deficit',()=>{
  assert.throws(()=>inspectReorderStockRows([row({shortfallExact:'1.999'})]),/REORDER_SHORTFALL_MISMATCH/);
});
test('healthy status may not hide a product below minimum',()=>{
  assert.throws(()=>inspectReorderStockRows([row({status:'healthy'})]),/REORDER_STATUS_MISMATCH/);
});
test('below-minimum status may not be assigned to a healthy product',()=>{
  const healthy=row({minStockExact:'1.000',shortfallExact:'0.000',needsReorder:false,status:'below_minimum'});
  assert.throws(()=>inspectReorderStockRows([healthy]),/REORDER_STATUS_MISMATCH/);
});
test('reorder flag cannot be false at or below an enabled minimum',()=>{
  assert.throws(()=>inspectReorderStockRows([row({needsReorder:false})]),/REORDER_FLAG_MISMATCH/);
});
test('reorder flag cannot be true above minimum',()=>{
  const healthy=row({minStockExact:'1.000',shortfallExact:'0.000',status:'healthy',needsReorder:true});
  assert.throws(()=>inspectReorderStockRows([healthy]),/REORDER_FLAG_MISMATCH/);
});
test('exact equality with nonzero minimum has status at_minimum and zero deficit',()=>{
  const threshold=row({minStockExact:'2.000',shortfallExact:'0.000',status:'at_minimum'});
  const r=prepareReorderStockPage([threshold]);
  assert.equal(r.reorderCandidates[0].action,'REVIEW_REORDER_POINT');
  assert.equal(r.reorderCandidates[0].minShortfallExact,'0.000');
});
test('out of stock with disabled minimum does not request replenishment',()=>{
  const disabled=row({stockExact:'0.000',reservedExact:'0.000',availableExact:'0.000',minStockExact:'0.000',
    shortfallExact:'0.000',status:'out_of_stock',needsReorder:false});
  assert.deepEqual(prepareReorderStockPage([disabled]).salesCandidateIds,[]);
});
test('exact near-Decimal(18,3) arithmetic does not round away thousandths',()=>{
  const large=row({stockExact:'999999999999999.999',reservedExact:'999999999999999.998',
    availableExact:'0.001',minStockExact:'1.000',shortfallExact:'0.999'});
  assert.equal(prepareReorderStockPage([large]).reorderCandidates[0].minShortfallExact,'0.999');
});
test('stock anomalies stay visible as exceptions, not misleading derived candidates',()=>{
  const bad=row({stockExact:'1.000',reservedExact:'2.000',availableExact:'-1.000',
    shortfallExact:'5.000',status:'out_of_stock'});
  const p=prepareReorderStockPage([bad]);
  assert.equal(p.stockReview.stockExceptions[0].reason,'RESERVED_EXCEEDS_STOCK');
  assert.deepEqual(p.salesCandidateIds,[]);
});
test('invalid second row aborts entire page without returning any candidate IDs',()=>{
  assert.throws(()=>prepareReorderStockPage([row(),row({productId:'id-b',sku:'SKU-B',
    shortfallExact:'2.001'})]),/REORDER_SHORTFALL_MISMATCH/);
});

test('the bounded reorder page validates inventory only once before projecting candidates',()=>{
  const stockRow=row();
  let stockReadCount=0;
  Object.defineProperty(stockRow,'stockExact',{
    enumerable:true,
    get(){stockReadCount++;return '5.000';}
  });
  const result=prepareReorderStockPage([stockRow]);
  assert.equal(stockReadCount,1,'stock preflight must not repeat after successful validation');
  assert.deepEqual(result.salesCandidateIds,['id-a']);
  assert.equal(result.reorderCandidates[0].minShortfallExact,'2.000');
});

test('the public candidate projector still rejects unvalidated stock and flags',()=>{
  assert.throws(()=>deriveReorderCandidates([row({availableExact:'999.000'})]),/REORDER_AVAILABLE_MISMATCH/);
  assert.throws(()=>deriveReorderCandidates([row({needsReorder:false})]),/REORDER_FLAG_MISMATCH/);
  assert.equal(deriveReorderCandidates([row()])[0].manualApprovalRequired,true);
  assert.equal(deriveReorderCandidates([row()])[0].autoPurchaseEnabled,false);
});

test('snapshot prevents validated stock from changing before candidate projection',()=>{
  const original=row();
  let reads=0;
  Object.defineProperty(original,'reservedExact',{
    enumerable:true,
    get(){ reads++; return reads===1?'3.000':'0.000'; }
  });
  const scan=prepareReorderStockPage([original]);
  assert.equal(reads,1,'validated stock must be read once, not again while projecting');
  assert.strictEqual(scan.rows[0],original,'preserve original read-only report row contract');
  assert.equal(scan.stockReview.eligibleRows[0].reservedExact,'3.000');
  assert.equal(scan.reorderCandidates[0].reservedExact,'3.000');
  assert.equal(scan.reorderCandidates[0].availableExact,'2.000');
  assert.equal(Object.isFrozen(scan.stockReview.eligibleRows[0]),true);
});

test('snapshot prevents a dynamic reorder flag from changing after validation',()=>{
  const original=row();
  let reads=0;
  Object.defineProperty(original,'needsReorder',{
    enumerable:true,
    get(){ reads++; return reads===1; }
  });
  const scan=prepareReorderStockPage([original]);
  assert.equal(reads,1);
  assert.deepEqual(scan.salesCandidateIds,['id-a']);
  assert.equal(scan.reorderCandidates[0].manualApprovalRequired,true);
  assert.equal(scan.reorderCandidates[0].autoPurchaseEnabled,false);
});
