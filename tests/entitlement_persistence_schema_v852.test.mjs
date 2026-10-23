import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const schema=readFileSync(new URL('../backend/prisma/schema.prisma',import.meta.url),'utf8');
const sql=readFileSync(new URL('../backend/prisma/migrations/20261022183000_issue_852_entitlement_event_foundation/migration.sql',import.meta.url),'utf8');
test('#852 creates customer rights separately from SaaS LicenseKey and money-ledger',()=>{
  for(const model of ['BenefitDefinition','CustomerEntitlement','EntitlementLedgerEvent']){
    assert.match(schema,new RegExp('model '+model+' \\{'));
    assert.match(sql,new RegExp('CREATE TABLE public\\."'+model+'"'));
  }
  assert.match(schema,/beneficiary\s+Client @relation\(fields: \[tenantId, beneficiaryId\]/);
  assert.match(schema,/product\s+Product @relation\(fields: \[tenantId, productId\]/);
  assert.match(sql,/benefit_scope_exact CHECK/);
  assert.match(sql,/entitlement_window CHECK/);
});
test('#852 persistent rights are DB append-only with unique effect and sequence',()=>{
  assert.match(sql,/customer_entitlement_no_mutation/);
  assert.match(sql,/entitlement_event_no_mutation/);
  assert.match(sql,/GRANT SELECT, INSERT ON public/);
  assert.match(sql,/"EntitlementLedgerEvent_tenantId_effectKey_key" UNIQUE/);
  assert.match(sql,/"EntitlementLedgerEvent_tenantId_entitlementId_sequence_key"/);
  assert.match(sql,/FORCE ROW LEVEL SECURITY/);
  assert.match(sql,/CONSTRAINT entitlement_grant_first/);
  assert.doesNotMatch(sql,/CREATE POLICY.*USING \(true\)/);
});
