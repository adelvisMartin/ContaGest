import test from 'node:test';import assert from 'node:assert/strict';
import {assertFiscalDocumentRuleFamily} from '../backend/src/modules/fiscal/fiscal-event-rule-family.ts';
const valid={module:'iva',kind:'invoice',period:'2099-06',effectiveAt:new Date('2099-06-15T00:00:00.000Z'),explicitEffectiveAt:true,ruleKeys:['iva.general']};
const bad=x=>assert.throws(()=>assertFiscalDocumentRuleFamily({...valid,...x}),/FISCAL_EVENT_RULE_FAMILY_MISMATCH/);
test('#775 accepted IVA rule and strict UTC period',()=>{assert.doesNotThrow(()=>assertFiscalDocumentRuleFamily(valid));assert.doesNotThrow(()=>assertFiscalDocumentRuleFamily({...valid,module:'retiva',kind:'withholding',ruleKeys:['ret_iva.purchase']}));});
test('#775 fail closed for wrong tax family, unreviewed selector shape, missing timestamp',()=>{bad({module:'islr'});bad({module:'retiva',ruleKeys:['iva.general']});bad({ruleKeys:['custom.general']});bad({ruleKeys:['iva.general','iva.general']});bad({explicitEffectiveAt:false});});
test('#775 event period and date cannot diverge',()=>{bad({period:'2099-07'});bad({effectiveAt:new Date('invalid')});bad({period:'2099-13'});});
test('#776 withholding must carry a retention rule',()=>{bad({kind:'withholding'});assert.doesNotThrow(()=>assertFiscalDocumentRuleFamily({...valid,module:'islr',kind:'withholding',ruleKeys:['islr.services']}));});
test('#776/#778 ISLR and IGTF documents cannot mix unrelated fiscal rule families',()=>{
  bad({module:'islr',kind:'withholding',ruleKeys:['islr.services','igtf.payment']});
  bad({module:'islr',kind:'withholding',ruleKeys:['islr.services','iva.general']});
  bad({module:'igtf',kind:'invoice',ruleKeys:['igtf.payment','islr.services']});
  assert.doesNotThrow(()=>assertFiscalDocumentRuleFamily({...valid,module:'igtf',ruleKeys:['igtf.payment']}));
});

test('#775/#776/#778 reviewed fiscal issuance cannot mix unrelated tax families',()=>{
  bad({module:'iva',ruleKeys:['iva.general','igtf.payment']});
  bad({module:'iva',ruleKeys:['iva.general','municipal.local']});
  bad({module:'retiva',kind:'withholding',ruleKeys:['ret_iva.purchase','igtf.payment']});
  bad({module:'retiva',kind:'withholding',ruleKeys:['ret_iva.purchase','islr.services']});
  bad({module:'municipal',ruleKeys:['municipal.local','islr.services']});
  assert.doesNotThrow(()=>assertFiscalDocumentRuleFamily({
    ...valid,module:'iva',ruleKeys:['iva.general','ret_iva.purchase','islr.service']
  }));
  assert.doesNotThrow(()=>assertFiscalDocumentRuleFamily({
    ...valid,module:'retiva',kind:'withholding',ruleKeys:['iva.general','ret_iva.purchase']
  }));
});

test('#775 IVA withholding cannot substitute an ISLR rule for RET_IVA',()=>{
  bad({kind:'withholding',ruleKeys:['iva.general','islr.service']});
  bad({kind:'withholding',ruleKeys:['iva.general']});
  assert.doesNotThrow(()=>assertFiscalDocumentRuleFamily({
    ...valid,kind:'withholding',ruleKeys:['iva.general','ret_iva.purchase']
  }));
  assert.doesNotThrow(()=>assertFiscalDocumentRuleFamily({
    ...valid,kind:'withholding',ruleKeys:['iva.general','ret_iva.purchase','islr.service']
  }));
});
test('#776/#778 ISLR and IGTF documents cannot mix unrelated fiscal rule families',()=>{
  bad({module:'islr',kind:'withholding',ruleKeys:['islr.services','igtf.payment']});
  bad({module:'islr',kind:'withholding',ruleKeys:['islr.services','iva.general']});
  bad({module:'igtf',kind:'invoice',ruleKeys:['igtf.payment','islr.services']});
  assert.doesNotThrow(()=>assertFiscalDocumentRuleFamily({...valid,module:'igtf',ruleKeys:['igtf.payment']}));
});
