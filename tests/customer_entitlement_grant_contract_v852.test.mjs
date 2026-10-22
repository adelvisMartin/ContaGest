import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const svc=readFileSync(new URL('../backend/src/modules/entitlements/customer-entitlement.service.ts',import.meta.url),'utf8');
const routes=readFileSync(new URL('../backend/src/modules/entitlements/customer-entitlement.routes.ts',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../backend/src/modules/route-manifest.ts',import.meta.url),'utf8');
test('#852 manual grant is source-scoped, audited, and atomic with its first ledger event',()=>{
  const grant=svc.split('export async function grantCustomerRight(')[1].split('export async function readCustomerRights')[0];
  assert.match(grant,/prisma\.\$transaction\(async tx=>/);
  assert.match(grant,/tx\.customerEntitlement\.create/);
  assert.match(grant,/tx\.entitlementLedgerEvent\.create/);
  assert.match(grant,/sequence:1,type:'GRANT'/);
  assert.match(grant,/await audit\(tx,ctx,'entitlement\.manual-grant'/);
  assert.match(grant,/sourceId:input\.effectKey/);
  assert.match(grant,/if\(!identical\)denied\(409/);
});
test('#852 customer and benefit refs validated from tenant backend, no arbitrary balance writes',()=>{
  assert.match(svc,/tx\.client\.findFirst\(\{where:\{tenantId:ctx\.tenantId,id:input\.beneficiaryId,active:true\}/);
  assert.match(svc,/tx\.benefitDefinition\.findFirst\(/);
  assert.match(svc,/tenantId:ctx\.tenantId,id:input\.locationId,status:'active'/);
  assert.doesNotMatch(routes,/remaining|balance|creditsLeft|wallet/);
  assert.match(svc,/projectEntitlementLedger/);
});
test('#852 admin-only API uses narrow manual grant + pure read without consume orphan writes',()=>{
  assert.match(manifest,/path: '\/customer-entitlements'/);
  assert.match(routes,/router\.use\(requireTenant\)/);
  assert.match(routes,/router\.use\(requirePermission\('admin\.manage'\)\)/);
  assert.match(routes,/reason:z\.string\(\)\.trim\(\)\.min\(10\)/);
  assert.match(routes,/Idempotency-Replayed/);
  assert.match(routes,/private, no-store/);
  assert.doesNotMatch(routes,/router\.post\('\/(?:consume|refund)|router\.put\('\/(?:consume|refund)/);
});

test('#852 concurrent manual grant replay serializes on tenant+effect before reading prior grant',()=>{
  const grant=svc.split('export async function grantCustomerRight(')[1].split('export async function readCustomerRights')[0];
  assert.match(grant,/cg:entitlement-grant:v1:\$\{ctx\.tenantId\}:\$\{input\.effectKey\}/);
  assert.match(grant,/pg_advisory_xact_lock\(hashtextextended\(/);
  assert.ok(grant.indexOf('pg_advisory_xact_lock')<grant.indexOf('const prior=await tx.customerEntitlement.findFirst'));
  assert.match(grant,/return \{entitlement:prior,replayed:true\}/);
});

test('#852 booking consume has no independent route and executes as a single caller-owned tx',()=>{
  const consume=svc.split('export async function consumeCustomerRightInBookingTransaction(')[1];
  assert.match(consume,/tx===prisma/);
  assert.match(consume,/pg_advisory_xact_lock\(hashtextextended\(/);
  assert.match(consume,/sourceType:'client',sourceId:right\.beneficiaryId/);
  assert.match(consume,/tx\.schedulingResourceAllocation\.findFirst\(/);
  assert.match(consume,/status:'active'/);
  assert.match(consume,/projectEntitlementLedger/);
  assert.match(consume,/tx\.entitlementLedgerEvent\.create\(/);
  assert.match(consume,/await audit\(tx,ctx,'entitlement\.booking-consume'/);
  assert.doesNotMatch(routes,/\/consume/);
});
test('#852 only integer-milli amounts authorize consumption, never float math',()=>{
  const consume=svc.split('export async function consumeCustomerRightInBookingTransaction(')[1];
  assert.match(consume,/BigInt\(w\)\*1000n/);
  assert.match(consume,/if\(milli\(quantity\)>milli\(projected\.remaining\)\)/);
  assert.doesNotMatch(consume,/Number\(quantity\)/);
});

test('#852 consume prevents booking cancel/allocation release races with SQL row locks',()=>{
  const consume=svc.split('export async function consumeCustomerRightInBookingTransaction(')[1];
  assert.match(consume,/SELECT "id" FROM public\."SchedulingBooking"/);
  assert.match(consume,/SELECT "id" FROM public\."SchedulingResourceAllocation"/);
  assert.match(consume,/FOR SHARE/);
  assert.ok(consume.indexOf('const bookingLocks=')<consume.indexOf('const existing=await tx.entitlementLedgerEvent.findFirst'));
  assert.ok(consume.indexOf('const allocationLocks=')<consume.indexOf('const existing=await tx.entitlementLedgerEvent.findFirst'));
});

test('#852 effect replay also preserves original courtesy reason',()=>{
  const grant=svc.split('export async function grantCustomerRight(')[1].split('export async function readCustomerRights')[0];
  assert.match(grant,/tx\.entitlementLedgerEvent\.findFirst\(/);
  assert.match(grant,/const identical=first\?\.reason===input\.reason/);
});
