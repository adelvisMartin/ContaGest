import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(file)=>fs.readFileSync(file,'utf8');
const schema=read('backend/prisma/schema.prisma');
const migration=read('backend/prisma/migrations/20260827054000_financial_idempotency/migration.sql');
const service=read('backend/src/shared/services/financial-idempotency.service.ts');
const sales=read('backend/src/modules/sales/sales.routes.ts');
const purchases=read('backend/src/modules/purchases/purchases.routes.ts');
const banking=read('backend/src/modules/banking/banking.routes.ts');
const accounting=read('backend/src/modules/accounting/accounting.routes.ts');
const security=read('backend/src/shared/middleware/security.ts');
const frontend=read('frontend/src/services/backendApi.js');
const rootPackage=read('package.json');
const qa=read('qa/financial-idempotency-v92.test.ts');
const adr=read('docs/ADR_FINANCIAL_IDEMPOTENCY_V92.md');
const api=read('docs/API_FINANCIAL_IDEMPOTENCY_V92.md');

test('persistencia aplica unique tenant + scope + keyHash y no guarda key raw',()=>{
  assert.match(schema,/model IdempotencyRecord/);
  assert.match(schema,/@@unique\(\[tenantId, scope, keyHash\]\)/);
  assert.match(migration,/CREATE UNIQUE INDEX "IdempotencyRecord_tenantId_scope_keyHash_key"/);
  assert.match(migration,/"keyHash" CHAR\(64\)/);
  assert.match(migration,/"requestHash" CHAR\(64\)/);
  assert.doesNotMatch(migration,/"key"\s+TEXT/);
});

test('primitive reserva y finaliza dentro de la misma transaction client',()=>{
  assert.match(service,/INSERT INTO public\."IdempotencyRecord"/);
  assert.match(service,/ON CONFLICT \("tenantId", "scope", "keyHash"\) DO NOTHING/);
  assert.match(service,/const result = await effect\(tx\)/);
  assert.match(service,/SET "status" = 'succeeded'/);
  assert.match(service,/prisma\.\$transaction\(\(tx\) => executeWithinTransaction/);
  assert.match(service,/IDEMPOTENCY_KEY_REUSED/);
});

test('scopes financieros críticos consumen la primitive',()=>{
  for(const [source,scope] of [
    [sales,'sales.create'],[sales,'sales.cancel'],
    [purchases,'purchases.create'],[purchases,'purchases.cancel'],
    [banking,'banking.movements.create'],[accounting,'accounting.entries.create']
  ]){
    assert.match(source,new RegExp(`scope:\\s*['\"]${scope.replaceAll('.','\\.')}['\"]`));
    assert.match(source,/runFinancialIdempotentMutation/);
  }
});

test('cancelaciones serializan por tenant y documento incluso con keys distintas',()=>{
  for(const source of [sales,purchases]){
    assert.match(source,/pg_advisory_xact_lock/);
    assert.match(source,/hashtextextended/);
    assert.match(source,/::text AS locked/);
  }
  assert.match(sales,/sales-cancel:\$\{sale\.id\}/);
  assert.match(purchases,/purchase-cancel:\$\{purchase\.id\}/);
});

test('replay financiero reconstruye recursos bajo tenant autenticado',()=>{
  assert.match(sales,/id:record\.resourceId,tenantId:ctx\.tenantId/);
  assert.match(purchases,/id:record\.resourceId, tenantId:ctx\.tenantId/);
  assert.match(banking,/id:record\.resourceId, tenantId:ctx\.tenantId/);
  assert.match(accounting,/id:record\.resourceId,tenantId:ctx\.tenantId/);
  assert.match(service,/const responseJson = input\.replay \? null/);
});

test('CORS y cliente oficial soportan Idempotency-Key',()=>{
  assert.match(security,/Idempotency-Key/);
  assert.match(frontend,/createFinancialIdempotencyKey/);
  assert.match(frontend,/financialInFlightKeys/);
  assert.match(frontend,/acquireFinancialIdempotencyKey/);
  assert.match(frontend,/releaseFinancialIdempotencyKey/);
  assert.match(frontend,/Idempotency-Key/);
  assert.match(frontend,/\/cancel\$/);
});

test('suite PostgreSQL real queda conectada al workflow E2E existente',()=>{
  assert.match(rootPackage,/test:backend:commercial:real/);
  assert.match(rootPackage,/financial-idempotency-v92\.test\.ts/);
  assert.match(qa,/20 concurrent sale retries/);
  assert.match(qa,/20 concurrent retries cancel one sale/);
  assert.match(qa,/different keys cannot race a purchase cancellation/);
  assert.match(qa,/20 concurrent bank retries/);
  assert.match(qa,/2 concurrent accounting retries/);
  assert.match(qa,/IDEMPOTENCY_KEY_REUSED/);
  assert.match(qa,/same opaque key is independent across tenants/);
});

test('documentación registra compatibilidad, retención y observabilidad',()=>{
  for(const doc of [adr,api]){
    assert.match(doc,/sales\.cancel/);
    assert.match(doc,/purchases\.cancel/);
    assert.match(doc,/expiresAt/);
    assert.match(doc,/idempotency\.concurrent_wait/);
    assert.match(doc,/tenant/);
  }
  assert.match(api,/Compatibilidad temporal sin key/);
  assert.match(api,/QA en PostgreSQL real/);
});
