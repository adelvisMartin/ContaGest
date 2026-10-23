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
  // #688 / #638: enforce tenant ownership against the current typed CRUD implementation,
  // not obsolete tenantScoped=false / 'any' branches.
  assert.match(source,/router\.use\(requireTenant,\s*requirePermission\(options\.permission\)\)/);
  assert.match(source,/const where:\s*Record<string,\s*unknown>\s*=\s*\{\s*tenantId:\s*ctx\.tenantId\s*\}/);
  assert.match(source,/delegate\.findMany\(\{\s*where,/);
  assert.match(source,/delegate\.findFirst\(\{\s*where:\s*\{\s*id:\s*parseCrudRouteId\(req\.params\.id\),\s*tenantId:\s*ctx\.tenantId\s*\}\s*\}\)/);
  const scopedMutations=source.match(/const where = \{\s*id:\s*parseCrudRouteId\(req\.params\.id\),\s*tenantId:\s*ctx\.tenantId\s*\};/g)||[];
  assert.equal(scopedMutations.length,2,'both update and delete must use a server-scoped tenant predicate');
  assert.match(source,/delegate\.findFirst\(\{\s*where\s*\}\)/);
  assert.match(source,/delegate\.update\(\{\s*where,\s*data:\s*req\.body\s*\}\)/);
  assert.match(source,/delegate\.delete\(\{\s*where\s*\}\)/);
  assert.match(source,/delegate\.create\(\{\s*data:\s*\{\s*\.\.\.req\.body,\s*tenantId:\s*ctx\.tenantId\s*\}\s*\}\)/);
  assert.match(source,/mutationGate\(options\.model,\s*'create'\),\s*validateBody\(options\.schema\.strict\(\)\)/);
  assert.match(source,/mutationGate\(options\.model,\s*'update'\),\s*validateBody\(options\.schema\.partial\(\)\.strict\(\)\)/);
  assert.doesNotMatch(source,/tenantId\s*:\s*req\.body\.tenantId/);
  assert.doesNotMatch(source,/tenantScoped\s*:\s*false/);
});

test('cross-tenant relation guard fails closed for sales, purchases and fiscal references',()=>{
  const source=read('backend/src/shared/middleware/tenant-reference-guard.ts');
  assert.match(source,/findFirst\(\{ where: \{ id: clientId, tenantId \}/);
  assert.match(source,/findFirst\(\{ where: \{ id: supplierId, tenantId \}/);
  assert.match(source,/where: \{ tenantId, id: \{ in: productIds \} \}/);
  assert.match(source,/findFirst\(\{ where: \{ id: periodId, tenantId \}/);
  assert.match(source,/code: 'CROSS_TENANT_REFERENCE'/);

  // A safe field LABEL (e.g. ['clientId']) does not disclose the foreign ID.
  // Check every thrown reference error uses a fixed label, never a value from the request.
  const callSites=[...source.matchAll(/\bthrow\s+crossTenantReference\(([^)]*)\)/g)];
  assert.equal(callSites.length,4,'all four protected relation checks must remain present');
  const labels=callSites.map((match)=>{
    const argument=match[1].trim();
    assert.match(argument,/^\['(?:clientId|supplierId|productId|periodId)'\]$/,'only fixed field labels are safe');
    return argument;
  });
  assert.deepEqual(new Set(labels),new Set(["['clientId']","['supplierId']","['productId']","['periodId']"]));
  const helper=source.slice(source.indexOf('function crossTenantReference('),source.indexOf('async function assertProducts('));
  assert.match(helper,/new HttpError\(409,\s*'Una o más referencias no están disponibles para el tenant autenticado\.'/);
  assert.doesNotMatch(helper,/req\.body|rawBody|tenantId|resourceId/);
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
