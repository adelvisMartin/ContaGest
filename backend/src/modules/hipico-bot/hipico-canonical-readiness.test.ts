import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const route=readFileSync(new URL('./hipico-canonical.routes.ts',import.meta.url),'utf8');
const store=readFileSync(new URL('./hipico-domain-event.store.ts',import.meta.url),'utf8');

test('canonical status requires owner and durable domain schema readiness',()=>{
  assert.match(route,/hipicoDomainPersistenceReadiness/);
  assert.match(route,/router\.get\('\/status',\s*async/);
  assert.match(route,/await hipicoDomainPersistenceReadiness\(\)/);
  assert.match(route,/const ready\s*=\s*ownerReady\s*&&\s*persistence\.ready/);
  assert.match(route,/res\.status\(ready \? 200 : 503\)/);
  assert.match(route,/persistence,/);
});

test('domain persistence readiness includes canonical tables and v16 confirmation audit columns',()=>{
  assert.match(store,/to_regclass\('public\.hipico_domain_aggregates'\)/);
  assert.match(store,/to_regclass\('public\.hipico_domain_events'\)/);
  assert.match(store,/column_name IN \('operator_confirmed','confirmation_reason'\)/);
  assert.match(store,/confirmationAuditReady/);
  assert.match(store,/return\{ready:false,tablesReady:false,confirmationAuditReady:false\}/);
});
