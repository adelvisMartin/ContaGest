import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route=readFileSync(new URL('../backend/src/modules/purchases/purchases.routes.ts',import.meta.url),'utf8');
test('#757 create purchase cannot declare paid or overdue without AP events',()=>{
  const schema=route.split('const purchaseSchema = z.object({')[1]?.split('});')[0];
  assert.ok(schema,'purchase create validation contract must exist');
  assert.match(schema,/status:\s*z\.enum\(\['draft', 'issued'\]\)\.default\('issued'\)/);
  assert.doesNotMatch(schema,/status:\s*z\.enum\(\[[^\]]*paid/);
  assert.match(route,/router\.post\('\/', validateBody\(purchaseSchema\)/);
});
test('#757 cancellation and historical status remain separate from initial creation',()=>{
  assert.match(route,/status: 'cancelled'/);
});

test('#757 frontend purchase mapper sends issued, never client-selected paid/overdue',()=>{
  const client=readFileSync(new URL('../frontend/src/services/supabaseSyncService.js',import.meta.url),'utf8');
  const mapper=client.split('function purchasePayload(data) {')[1]?.split('function normalizeLedgerEntry')[0];
  assert.ok(mapper,'purchasePayload must remain present for the Purchases UI');
  assert.match(mapper,/status:\s*'issued'/);
  assert.doesNotMatch(mapper,/statusFromUi\(data\.status\)/);
});
test('#757 authenticated tenant references are validated inside creation transaction',()=>{
  assert.match(route,/router\.use\(requireTenant, requirePermission\('purchases\.manage'\)\)/);
  assert.match(route,/await validateTenantMutationReferences\(tx, ctx\.tenantId, '\/purchases', req\.body\)/);
  assert.match(route,/runFinancialIdempotentMutation\(/);
});
