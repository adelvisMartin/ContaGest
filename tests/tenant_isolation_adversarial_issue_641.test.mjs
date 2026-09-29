import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { expandDirectionalCases, summarizeTenantIsolationMatrix, validateTenantIsolationMatrix } from '../scripts/tenant-isolation-contract-v641.mjs';

const matrix=JSON.parse(fs.readFileSync('config/tenant-isolation-adversarial-v641.json','utf8'));
const read=(file)=>fs.readFileSync(file,'utf8');

test('tenant isolation matrix is versioned, bidirectional and covers critical contexts',()=>{
  assert.doesNotThrow(()=>validateTenantIsolationMatrix(matrix));
  const summary=summarizeTenantIsolationMatrix(matrix);
  assert.ok(summary.contexts>=4);
  assert.ok(summary.surfaces>=10);
  assert.equal(summary.directionalCases,summary.surfaces*2);
  for(const required of ['commercial','financial','identity','sensitive-verticals'])assert.ok(matrix.contexts.some((row)=>row.id===required),required);
  for(const required of ['api','repository'])assert.ok(summary.layers.includes(required),required);
});

test('every surface expands to A→B and B→A without silent one-way coverage',()=>{
  const cases=expandDirectionalCases(matrix);
  for(const context of matrix.contexts){
    for(const surface of context.surfaces){
      assert.ok(cases.some((row)=>row.surfaceId===surface.id&&row.direction==='A_TO_B'),`${surface.id}:A_TO_B`);
      assert.ok(cases.some((row)=>row.surfaceId===surface.id&&row.direction==='B_TO_A'),`${surface.id}:B_TO_A`);
    }
  }
});

test('CRUD factory scopes list/read/update/delete by authenticated tenant and overrides tenant on create',()=>{
  const source=read('backend/src/modules/crud.factory.ts');
  assert.match(source,/const where: any = options\.tenantScoped === false \? \{\} : \{ tenantId \}/);
  assert.match(source,/findFirst\(\{ where: options\.tenantScoped === false \? where : \{ \.\.\.where, tenantId \} \}\)/);
  assert.match(source,/findFirst\(\{ where: options\.tenantScoped === false \? \{ id: req\.params\.id \} : \{ id: req\.params\.id, tenantId: ctx\.tenantId \} \}\)/);
  assert.match(source,/\{ \.\.\.req\.body, tenantId: ctx\.tenantId \}/);
  assert.doesNotMatch(source,/tenantId\s*:\s*req\.body\.tenantId/);
});

test('cross-tenant relation guard fails closed for sales, purchases and fiscal references',()=>{
  const source=read('backend/src/shared/middleware/tenant-reference-guard.ts');
  assert.match(source,/findFirst\(\{ where: \{ id: clientId, tenantId \}/);
  assert.match(source,/findFirst\(\{ where: \{ id: supplierId, tenantId \}/);
  assert.match(source,/where: \{ tenantId, id: \{ in: productIds \} \}/);
  assert.match(source,/findFirst\(\{ where: \{ id: periodId, tenantId \}/);
  assert.match(source,/code: 'CROSS_TENANT_REFERENCE'/);
  assert.doesNotMatch(source,/crossTenantReference\([^)]*(tenantId|clientId|supplierId|periodId)/);
});

test('real PostgreSQL/API adversarial suite and local verification integration are present',()=>{
  const qa=read('qa/tenant-isolation-adversarial-v641.test.ts');
  const runner=read('scripts/local-verification-runner-v630.mjs');
  assert.match(qa,/createRealBackendHarness/);
  assert.match(qa,/signAccessToken/);
  assert.match(qa,/tenant-b/i);
  assert.match(qa,/CROSS_TENANT_REFERENCE/);
  assert.match(qa,/404/);
  assert.match(qa,/409/);
  assert.match(qa,/\$executeRawUnsafe|\$queryRawUnsafe/);
  assert.match(runner,/tenant-isolation-adversarial-v641/);
});

test('matrix validator rejects missing direction, API or persistence coverage',()=>{
  assert.throws(()=>validateTenantIsolationMatrix({...matrix,directions:['A_TO_B']}),/TENANT_MATRIX_DIRECTIONS/);
  const noApi=structuredClone(matrix);noApi.contexts[0].surfaces[0].layers=['repository'];
  assert.throws(()=>validateTenantIsolationMatrix(noApi),/TENANT_MATRIX_API_LAYER/);
  const noPersistence=structuredClone(matrix);noPersistence.contexts[0].surfaces[0].layers=['api','service'];
  assert.throws(()=>validateTenantIsolationMatrix(noPersistence),/TENANT_MATRIX_PERSISTENCE_LAYER/);
});
