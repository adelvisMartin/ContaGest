import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateInventory, calculateLedger, calculatePayroll, calculateQuote } from '../frontend/src/core/calculator.js';
import { ACCOUNTING_RULES, INVENTORY_RULES, PAYROLL_RULES, buildKardex } from '../frontend/src/core/businessRules.js';

test('accounting characterization: double-entry tolerance remains below one cent', () => {
  const balanced=calculateLedger([{debit:100,credit:0},{debit:0,credit:100}]);
  assert.deepEqual(balanced,{debit:100,credit:100,diff:0,balanced:true});
  const unbalanced=calculateLedger([{debit:100,credit:0},{debit:0,credit:99.98}]);
  assert.equal(unbalanced.balanced,false);
  assert.equal(unbalanced.diff,0.02);
  assert.equal(ACCOUNTING_RULES.reversals,'never_delete_posted_entries');
  assert.equal(ACCOUNTING_RULES.cancelledDocuments,'reverse_and_mark_cancelled');
});

test('fiscal characterization: quote totals keep taxes and retentions contracts', () => {
  const result=calculateQuote({
    currency:'USD',manualAmount:100,items:[],
    taxes:{
      iva:{active:true,rate:16},
      igtf:{active:true,rate:3},
      islr:{active:false,rate:2},
      custom:{active:false,rate:0},
      retIva:{active:true,rate:75},
      retIslr:{active:true,rate:2}
    }
  },50);
  assert.equal(result.baseImponible,5000);
  assert.equal(result.iva,800);
  assert.equal(result.igtf,150);
  assert.equal(result.retIva,600);
  assert.equal(result.retIslr,100);
  assert.equal(result.taxesTotal,950);
  assert.equal(result.retentions,700);
  assert.equal(result.total,5250);
  assert.equal(result.totalUsdEquivalent,105);
});

test('payroll characterization: current formula remains stable before UI migration', () => {
  const result=calculatePayroll({salary:3000,days:30,overtimeHours:8,bonus:100,deductionsExtra:25});
  assert.equal(result.daily,100);
  assert.equal(result.earned,3000);
  assert.equal(result.overtime,150);
  assert.equal(result.gross,3250);
  assert.equal(result.ivss,130);
  assert.equal(result.faov,32.5);
  assert.equal(result.inces,16.25);
  assert.equal(result.totalDeductions,203.75);
  assert.equal(result.net,3046.25);
  assert.equal(PAYROLL_RULES.receiptRequired,true);
});

test('inventory characterization: value, retail, margin and low-stock semantics stay stable', () => {
  const result=calculateInventory([
    {stock:10,min:2,costUsd:3,priceUsd:5},
    {stock:1,min:1,costUsd:10,priceUsd:16}
  ]);
  assert.deepEqual(result,{valueUsd:40,retailUsd:66,lowStock:1,marginUsd:26});
  assert.equal(INVENTORY_RULES.costMethod,'weighted_average');
  assert.equal(INVENTORY_RULES.kardex,'all_movements_are_immutable');
});

test('kardex characterization: weighted average and outgoing balance are preserved', () => {
  const rows=buildKardex({
    product:{id:'p1',sku:'A',costUsd:10},
    movements:[
      {sku:'A',type:'in',qty:10,unitCost:10},
      {sku:'A',type:'in',qty:10,unitCost:20},
      {sku:'A',type:'out',qty:5}
    ]
  });
  assert.equal(rows[0].balanceQty,10);
  assert.equal(rows[1].balanceQty,20);
  assert.equal(rows[1].averageCost,15);
  assert.equal(rows[2].balanceQty,15);
  assert.equal(rows[2].averageCost,15);
  assert.equal(rows[2].balanceValue,225);
});
