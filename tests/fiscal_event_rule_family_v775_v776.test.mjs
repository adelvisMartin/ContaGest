import test from 'node:test';import assert from 'node:assert/strict';
import {assertFiscalDocumentRuleFamily} from '../backend/src/modules/fiscal/fiscal-event-rule-family.ts';
const valid={module:'iva',kind:'invoice',period:'2099-06',effectiveAt:new Date('2099-06-15T00:00:00.000Z'),explicitEffectiveAt:true,ruleKeys:['iva.general']};
const bad=x=>assert.throws(()=>assertFiscalDocumentRuleFamily({...valid,...x}),/FISCAL_EVENT_RULE_FAMILY_MISMATCH/);
test('#775 accepted IVA rule and strict UTC period',()=>{assert.doesNotThrow(()=>assertFiscalDocumentRuleFamily(valid));assert.doesNotThrow(()=>assertFiscalDocumentRuleFamily({...valid,module:'retiva',kind:'withholding',ruleKeys:['ret_iva.purchase']}));});
test('#775 fail closed for wrong tax family, unreviewed selector shape, missing timestamp',()=>{bad({module:'islr'});bad({module:'retiva',ruleKeys:['iva.general']});bad({ruleKeys:['custom.general']});bad({ruleKeys:['iva.general','iva.general']});bad({explicitEffectiveAt:false});});
test('#775 event period and date cannot diverge',()=>{bad({period:'2099-07'});bad({effectiveAt:new Date('invalid')});bad({period:'2099-13'});});
test('#776 withholding must carry a retention rule',()=>{bad({kind:'withholding'});assert.doesNotThrow(()=>assertFiscalDocumentRuleFamily({...valid,module:'islr',kind:'withholding',ruleKeys:['islr.services']}));});
