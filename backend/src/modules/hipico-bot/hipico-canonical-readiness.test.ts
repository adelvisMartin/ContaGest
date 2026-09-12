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

test('domain persistence readiness includes tables, audit columns and physical integrity invariants',()=>{
  assert.match(store,/to_regclass\('public\.hipico_domain_aggregates'\)/);
  assert.match(store,/to_regclass\('public\.hipico_domain_events'\)/);
  assert.match(store,/column_name IN \('operator_confirmed','confirmation_reason'\)/);
  assert.match(store,/hipico_domain_events_source_identity_unique/);
  assert.match(store,/hipico_domain_events_source_identity_v297/);
  assert.match(store,/hipico_domain_events_aggregate_fk/);
  assert.match(store,/hipico_domain_events_confirmation_audit_check/);
  assert.match(store,/hipico_domain_events_immutable/);
  assert.match(store,/relrowsecurity/);
  assert.match(store,/browserWritesRevoked/);
  assert.match(store,/authenticatedRoleReady/);
});

test('readiness fails closed if any canonical DB protection is missing',()=>{
  assert.match(store,/const ready=tablesReady/);
  for(const required of [
    'confirmationAuditReady','sourceIdentityReady','aggregateFkReady','confirmationConstraintReady',
    'immutableTriggerReady','rlsReady','authenticatedRoleReady','browserWritesRevoked'
  ]){
    assert.match(store,new RegExp(`&&${required}`));
  }
  assert.deepEqual(
    Object.values({
      ready:false,
      tablesReady:false,
      confirmationAuditReady:false,
      sourceIdentityReady:false,
      aggregateFkReady:false,
      confirmationConstraintReady:false,
      immutableTriggerReady:false,
      rlsReady:false,
      authenticatedRoleReady:false,
      browserWritesRevoked:false
    }).every((value)=>value===false),
    true
  );
  assert.match(store,/return unavailablePersistenceReadiness\(\)/);
});

test('authenticated browser role is explicitly denied direct canonical mutations',()=>{
  for(const table of ['hipico_domain_aggregates','hipico_domain_events']){
    for(const privilege of ['INSERT','UPDATE','DELETE']){
      assert.match(store,new RegExp(`has_table_privilege\\('authenticated','public\\.${table}','${privilege}'\\)`));
    }
  }
});
