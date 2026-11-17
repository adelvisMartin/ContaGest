import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSemanticAccountBinding, SEMANTIC_ACCOUNT_ROLES } from '../backend/src/modules/chart-accounts/account-role-policy.ts';

const a = Object.freeze({ tenantId: 'a', code: '1.01', nature: 'debit', active: true, allowPosting: true, parentCode: '1' });
const bind = (account = a, patch = {}) => assertSemanticAccountBinding(account, { tenantId: 'a', role: 'ar', expectedNature: 'debit', ...patch });
const denied = (fn) => assert.throws(fn, {message:'ACCOUNT_ROLE_MAPPING_NOT_POSTABLE'});

test('#785 accepts valid role and preserves tenant/account/nature', () => {
  const result = bind();
  assert.deepEqual(result, {tenantId:'a', role:'ar', accountCode:'1.01', nature:'debit'});
  assert.ok(Object.isFrozen(result));
  assert.ok(SEMANTIC_ACCOUNT_ROLES.includes('vat_input'));
});
test('#785 rejects tenant B, inactive, parent and missing account', () => {
  denied(()=>bind(null));
  denied(()=>bind({...a,tenantId:'b'}));
  denied(()=>bind({...a,active:false}));
  denied(()=>bind({...a,allowPosting:false}));
  denied(()=>bind({...a,code:''}));
});
test('#785 rejects nature mismatch and unknown role, does not infer codes', () => {
  denied(()=>bind({...a,nature:'credit'}));
  denied(()=>bind({...a,nature:'arbitrary'}));
  denied(()=>bind(a,{role:'arbitrary'}));
  denied(()=>bind(a,{expectedNature:'other'}));
});

test('#785 rejects a self-referential parent even when account is marked postable',()=>{
  denied(()=>bind({...a,parentCode:a.code}));
});

test('#785 unnormalized chart-account codes and tenant identities cannot authorize posting',()=>{
  for(const code of ['   ',' 1.01','1.01 ','\t1.01']){
    denied(()=>bind({...a,code}));
  }
  for(const tenantId of ['   ','a ',' a']){
    denied(()=>bind({...a,tenantId},{tenantId}));
  }
});
