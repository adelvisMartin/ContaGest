import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('backend/prisma/migrations/20260907101500_approval_sod_v236/migration.sql');
const service=read('backend/src/modules/approvals/approvals.service.ts');
const gate=read('backend/src/modules/approvals/approval-execution-gate.ts');
const routes=read('backend/src/modules/approvals/approvals.routes.ts');
const index=read('backend/src/modules/index.ts');
const ui=read('frontend/src/pages/ApprovalsPage.js');

test('issue 236 persists a versioned tenant-scoped policy/request/decision/delegation model',()=>{
  for(const table of ['ApprovalPolicy','ApprovalRequest','ApprovalDecision','ApprovalDelegation'])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`));
  assert.match(migration,/FORCE ROW LEVEL SECURITY/g);
  assert.match(migration,/private\.current_tenant_id\(\)/);
  assert.match(migration,/UNIQUE \("tenantId", "capability", "version"\)/);
  assert.match(migration,/UNIQUE \("requestId", "approverId", "revision"\)/);
});

test('issue 236 blocks self approval, payload drift and double execution',()=>{
  assert.match(service,/APPROVAL_SELF_APPROVAL_FORBIDDEN/);
  assert.match(service,/APPROVAL_PAYLOAD_CHANGED/);
  assert.match(service,/APPROVAL_ALREADY_CONSUMED/);
  assert.match(service,/SELECT \* FROM "ApprovalRequest"[\s\S]*FOR UPDATE/);
  assert.match(service,/payloadHash/);
});

test('issue 236 gates every initial high-impact capability at server authority',()=>{
  const expected=['purchases.issue','purchases.cancel','banking.payment','banking.reverse','banking.correct','inventory.adjust','inventory.reverse','fiscal.reopen','accounting.post','accounting.reverse'];
  for(const capability of expected)assert.ok(gate.includes(`'${capability}'`),`missing ${capability}`);
  assert.match(index,/router\.use\(approvalExecutionGate\)/);
  assert.match(gate,/x-approval-request-id/);
});

test('issue 236 exposes operational inbox, aging, delegation and break-glass audit',()=>{
  for(const route of ['/inbox','/report','/delegations','/requests/:id/break-glass'])assert.ok(routes.includes(route),`missing ${route}`);
  assert.match(service,/approval\.break-glass/);
  assert.match(service,/avgAgeHours/);
  assert.match(ui,/Esperando aprobación/);
  assert.match(ui,/Edad pendiente/);
});
