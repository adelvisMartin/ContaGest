import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertExternalFiscalRecordAllowed, assertUntrustedFiscalPayload,
} from '../backend/src/modules/fiscal/fiscal-document-authority-policy.ts';

const basic = {module:'fiscal',kind:'supporting_document',payload:{reference:'external',amount:'0'}};
test('#751 external evidence is allowed as support-only',()=>{
  assert.doesNotThrow(()=>assertExternalFiscalRecordAllowed(basic));
  assert.doesNotThrow(()=>assertExternalFiscalRecordAllowed({...basic,kind:'other'}));
});
test('#775 regulated documents cannot bypass source review through the manual endpoint',()=>{
  for(const module of ['iva','islr','retiva','igtf','municipal']) {
    assert.throws(()=>assertExternalFiscalRecordAllowed({...basic,module}),/FISCAL_EXTERNAL_DOCUMENT_DENIED/);
  }
  for(const kind of ['invoice','credit_note','debit_note','withholding','tax_return']) {
    assert.throws(()=>assertExternalFiscalRecordAllowed({...basic,kind}),/FISCAL_EXTERNAL_DOCUMENT_DENIED/);
  }
});
test('#751 payload cannot forge server-owned evidence metadata',()=>{
  for(const key of ['_fiscalModule','_effectiveAt','_ruleKeys','_taxpayerProfileHash',
    '__proto__','constructor','prototype']) {
    const payload=JSON.parse('{"'+key+'":"fake"}');
    assert.throws(()=>assertUntrustedFiscalPayload(payload),/FISCAL_PAYLOAD_RESERVED_FIELD/);
    assert.throws(()=>assertExternalFiscalRecordAllowed({...basic,payload}),/FISCAL_PAYLOAD_RESERVED_FIELD/);
  }
});
test('#751 rejects unsafe non-JSON record payload shapes',()=>{
  for (const payload of [null,[],0,'{}']) {
    assert.throws(()=>assertUntrustedFiscalPayload(payload),/FISCAL_PAYLOAD_INVALID/);
  }
});
