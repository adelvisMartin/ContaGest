import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateStockAgeing, StockAgeingError, STOCK_AGEING_MAX_MOVEMENTS } from '../backend/src/modules/reports/stock-ageing-fifo.ts';

const now = new Date('2026-10-15T05:00:00.000Z');
const entry = (id, type, quantity, daysAgo) => ({ id, type, quantity, createdAt: new Date(now.getTime()-daysAgo*86400000) });
const compute = (stockExact, movements) => calculateStockAgeing({ stockExact, movements, asOf: now });

test('FIFO ageing recovers buckets and exact thousandths', () => {
  const output = compute('4.750', [entry('01','in','2.750',200),entry('02','in','5.000',40),entry('03','out','3.000',1)]);
  assert.equal(output.buckets.day181PlusExact,'0.000');
  assert.equal(output.buckets.day31to90Exact,'4.750');
  assert.equal(output.stockExact,'4.750');
  assert.equal(output.reconciled,true);
});
test('reservation and release never affect physical ledger', () => {
  const out=compute('8', [entry('01','in','8',40),entry('02','reservation','7',30),entry('03','release','3',10)]);
  assert.equal(out.buckets.day31to90Exact,'8.000');
});
test('adjustments handle signed quantities without float',()=>{
  const out=compute('1.125', [entry('01','in','2.125',200),entry('02','adjustment','-1',100)]);
  assert.equal(out.buckets.day181PlusExact,'1.125');
});
test('zero inventory without movement is a genuine reconcilable empty state',()=>{
  const out=compute('0.000', []);assert.equal(out.stockExact,'0.000');
  assert.equal(out.activeCohortCount,0);
});
test('incomplete inbound history fails closed',()=>{
  assert.throws(()=>compute('0',[entry('01','out','1',1)]),e=>e instanceof StockAgeingError && e.code==='AGEING_INCOMPLETE_HISTORY');
});
test('mismatch with canonical Product.stock fails closed',()=>{
  assert.throws(()=>compute('20',[entry('01','in','5',1)]),e=>e.code==='AGEING_LEDGER_MISMATCH');
});
test('future or unsorted movements fail closed',()=>{
  assert.throws(()=>compute('2',[entry('01','in','1',0),entry('02','in','1',3)]),e=>e.code==='AGEING_INVALID');
  assert.throws(()=>compute('1',[entry('01','in','1',-1)]),e=>e.code==='AGEING_INVALID');
});
test('invalid decimal and precision reject',()=>{
  for(const qty of ['1e4','1.0001','NaN','-2','1,000']){
    assert.throws(()=>compute('1',[entry('01','in',qty,1)]),e=>e.code==='AGEING_INVALID');
  }
});
test('boundary days 30/31/90/91/180/181 are bucketed deterministically',()=>{
  const entries=[30,31,90,91,180,181].reverse().map((days,i)=>entry('0'+i,'in','1',days));
  const out=compute('6',entries);
  assert.deepEqual(Object.values(out.buckets), ['1.000','2.000','2.000','1.000']);
});
test('large batches fail closed without trimming missing tail',()=>{
  const many=Array.from({length:STOCK_AGEING_MAX_MOVEMENTS+1},(_,i)=>entry(String(i).padStart(5,'0'),'in','1',5000-i));
  assert.throws(()=>compute('5001',many),e=>e.code==='AGEING_INVALID');
});
test('inbound movement and negative adjustment exhaustion cannot fabricate cohorts',()=>{
  assert.throws(()=>compute('0',[entry('01','in','1',5),entry('02','adjustment','-2',1)]),e=>e.code==='AGEING_INCOMPLETE_HISTORY');
});
test('model labels prevent treating FIFO estimate as physical lot provenance',()=>{
 const v=compute('1',[entry('01','in','1',12)]);
 assert.equal(v.interpretation,'FIFO_ASSUMPTION_NOT_PHYSICAL_LOT_PROVENANCE');
 assert.equal(v.currentOnly,true);
});
