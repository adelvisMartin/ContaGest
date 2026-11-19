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
