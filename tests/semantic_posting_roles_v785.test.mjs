import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSemanticPostingRoles } from '../backend/src/modules/chart-accounts/semantic-posting-policy.ts';

const tenantId = 'tenant-A';
const binding = (role, nature, accountCode = `SYN-${role}`) => ({
  tenantId, role, accountCode, name: `Test ${role}`, nature,
  active: true, allowPosting: true, parentCode: 'SYN-PARENT'
});
const good = [binding('ar', 'debit'), binding('revenue', 'credit'), binding('vat_output', 'credit'), binding('tax_payable', 'credit')];
const required = ['ar', 'revenue', 'vat_output', 'tax_payable'];
const deny = (rows, roles = required) => assert.throws(() => assertSemanticPostingRoles(tenantId, roles, rows), { message: 'ACCOUNT_ROLE_POSTING_NOT_READY' });

test('#785 semantic posting resolves every required tenant account with canonical nature', () => {
  const accounts = assertSemanticPostingRoles(tenantId, required, good);
  assert.equal(accounts.ar.accountCode, 'SYN-ar');
  assert.equal(accounts.tax_payable.name, 'Test tax_payable');
  assert.ok(Object.isFrozen(accounts));
  assert.ok(Object.isFrozen(accounts.ar));
});

test('#785 no hidden account-code defaults: missing, duplicate, cross-tenant and unexpected roles fail closed', () => {
  deny(good.slice(0, 3));
  deny([...good, good[0]]);
  deny(good.map((r, i) => i === 0 ? { ...r, tenantId: 'tenant-B' } : r));
  deny(good, [...required, 'unconfigured']);
  deny(good, ['ar', 'ar']);
});

test('#785 rejected nature, inactive, non-postable or broken hierarchy cannot post', () => {
  for (const bad of [
    { ...good[0], nature: 'credit' }, { ...good[0], active: false },
    { ...good[0], allowPosting: false }, { ...good[0], accountCode: '' },
    { ...good[0], name: '' }, { ...good[0], parentCode: 12 },
  ]) deny([bad, ...good.slice(1)]);
});

test('#785 purchase roles use AP credit, VAT input debit and COGS debit', () => {
  const rows = [binding('ap', 'credit'), binding('vat_input', 'debit'), binding('cost_of_sales', 'debit')];
  const result = assertSemanticPostingRoles(tenantId, ['ap', 'vat_input', 'cost_of_sales'], rows);
  assert.equal(result.ap.nature, 'credit');
  deny([{ ...rows[0], nature: 'debit' }, ...rows.slice(1)], ['ap', 'vat_input', 'cost_of_sales']);
});
