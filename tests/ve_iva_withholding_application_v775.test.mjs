import test from 'node:test';import assert from 'node:assert/strict';
import {exactMinor,planPostedPurchaseWithholding,isInternalRetivaPostingEnabled} from '../backend/src/modules/fiscal/ve-iva-withholding-application.ts';
const ratio=(key,basis,numerator,denominator=100)=>({ruleId:key,ruleKey:key,ruleHash:'a'.repeat(64),legalSourceId:'s',legalSourceSha256:'b'.repeat(64),definition:{formula:'RATIO_MINOR_UNITS',numerator,denominator,basis}});
const input={tenantId:'T',invoiceTenantId:'T',supplierTenantId:'T',sourceLedgerTenantId:'T',invoiceStatus:'issued',supplierRetentionProfile:'ordinary',taxpayerCategory:'special_notified',originalLedgerPosted:true,issuedAt:new Date('2099-01-05T00:00:00Z'),recognizedAt:new Date('2099-01-06T00:00:00Z'),period:'2099-01',currency:'VES',exchangeRate:'1',functionalCurrency:'VES',taxableMinor:10000,invoiceVatMinor:1600,invoiceTotalMinor:11600,iva:ratio('iva.general','taxable_minor',16),retention:ratio('ret_iva.general','tax_minor',75)};
const denied=changes=>assert.throws(()=>planPostedPurchaseWithholding({...input,...changes}),/VE_IVA_WITHHOLDING_APPLICATION_REJECTED/);
test('posted purchase with source IVA 1600 and retention 1200 creates only AP debit and withholding payable credit',()=>{assert.deepEqual(planPostedPurchaseWithholding(input),{taxableMinor:10000,vatMinor:1600,withheldMinor:1200,period:'2099-01',debitRole:'ap',creditRole:'withholding_payable',mode:'INTERNAL_POSTING_PLAN'});});
test('reject tenant crossover, missing posted AP, client-captured classification',()=>{for(const fields of [{invoiceTenantId:'B'},{supplierTenantId:'B'},{sourceLedgerTenantId:'B'},{originalLedgerPosted:false},{taxpayerCategory:'ordinary'},{supplierRetentionProfile:'special'},{invoiceStatus:'cancelled'}])denied(fields);});
test('reject misleading invoice VAT from UI and any drift from approved IVA rate',()=>{for(const fields of [{invoiceVatMinor:1700},{invoiceTotalMinor:11500},{taxableMinor:9999},{iva:ratio('islr.fake','taxable_minor',16)},{retention:ratio('iva.wrong','tax_minor',75)}])denied(fields);});
test('no unsupported FX, wrong recognition periods or previous tax events',()=>{for(const fields of [{currency:'USD'},{functionalCurrency:'USD'},{exchangeRate:'1.2'},{period:'2099-02'},{recognizedAt:new Date('2099-01-04T00:00:00Z')},{issuedAt:new Date('invalid')}])denied(fields);});
test('decimal conversion exact and safe, never float/cents imprecision',()=>{assert.equal(exactMinor('123.45'),12345);assert.equal(exactMinor('0.01'),1);for(const v of ['1.001','-1.00','1e4','0.1','100000000000000.00'])assert.throws(()=>exactMinor(v),/VE_IVA_WITHHOLDING_APPLICATION_REJECTED/);});

test('internal withholding posting is OFF unless exact true opt-in (no test or production shortcuts)',()=>{
  for(const value of [undefined,null,false,true,'TRUE','1','yes','enabled','false',''])
    assert.equal(isInternalRetivaPostingEnabled(value),false);
  assert.equal(isInternalRetivaPostingEnabled('true'),true);
});
