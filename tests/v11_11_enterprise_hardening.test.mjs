import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, rootUrl), 'utf8');

const files = [
  'frontend/src/services/runtimePolicy.js',
  'frontend/src/services/enterpriseOperationsService.js',
  'frontend/src/services/purchaseOperationsService.js',
  'frontend/src/components/muiRuntime.js',
  'backend/src/modules/banking/banking.routes.ts',
  'backend/src/modules/payroll/payroll.routes.ts',
  'backend/src/modules/tasks/tasks.routes.ts',
  'backend/src/modules/employees/employees.routes.ts',
  'backend/src/modules/purchases/purchases.routes.ts',
  'backend/prisma/migrations/20260731153000_employee_department_hired_at/migration.sql',
  'docs/ENTERPRISE_HARDENING_V111.md'
];

test('v11.11 hardening files exist', () => {
  files.forEach((path) => assert.equal(existsSync(new URL(path, rootUrl)), true, path));
});

test('production login does not expose seeded administrator credentials', () => {
  const login = read('frontend/src/pages/LoginPage.js');
  assert.doesNotMatch(login, /Adm1n\$2026/);
  assert.doesNotMatch(login, /btnFillAdmin/);
  assert.doesNotMatch(login, /btnDemoLogin/);
  assert.match(login, /captcha/i);
  assert.match(login, /coordinateChallenge/);
});

test('production persistence failures never create silent local copies', () => {
  const policy = read('frontend/src/services/runtimePolicy.js');
  const sales = read('frontend/src/pages/SalesPage.js');
  const inventory = read('frontend/src/pages/InventoryPage.js');
  assert.match(policy, /allowOfflineFallback/);
  assert.match(policy, /VITE_ALLOW_OFFLINE_FALLBACK/);
  assert.match(policy, /no guardará una copia local en producción/i);
  assert.match(sales, /RuntimePolicy\.handlePersistenceFailure/);
  assert.match(inventory, /RuntimePolicy\.handlePersistenceFailure/);
});

test('React managed veterinary workspace is preserved across auxiliary Store updates', () => {
  const app = read('frontend/src/app.js');
  assert.match(app, /REACT_MANAGED_ROUTES/);
  assert.match(app, /veterinaryClinicRoot/);
  assert.match(app, /signature===lastShellSignature/);
  assert.match(app, /page\.update/);
});

test('Material UI and hot toast are bundled locally and applied to reusable forms', () => {
  const runtime = read('frontend/src/components/muiRuntime.js');
  assert.match(runtime, /@mui\/material/);
  assert.match(runtime, /react-hot-toast/);
  assert.match(runtime, /promoteLegacyFields/);
  assert.match(runtime, /Mui\.TextField/);
  assert.match(runtime, /Mui\.Select/);
  assert.doesNotMatch(runtime, /esm\.sh/);
});

test('banking payroll and tasks APIs are tenant scoped, permission protected and audited', () => {
  ['banking/banking.routes.ts','payroll/payroll.routes.ts','tasks/tasks.routes.ts'].forEach((relative) => {
    const source = read(`backend/src/modules/${relative}`);
    assert.match(source, /requireTenant/);
    assert.match(source, /requirePermission/);
    assert.match(source, /tenantId/);
    assert.match(source, /writeAudit/);
  });
  const banking = read('backend/src/modules/banking/banking.routes.ts');
  assert.match(banking, /prisma\.\$transaction/);
  assert.match(banking, /reconcile/);
  const payroll = read('backend/src/modules/payroll/payroll.routes.ts');
  assert.match(payroll, /approved/);
  assert.match(payroll, /recalculatePeriod/);
  const tasks = read('backend/src/modules/tasks/tasks.routes.ts');
  assert.match(tasks, /status:'archived'/);
});

test('purchase lifecycle is accounting-safe and server authoritative', () => {
  const route = read('backend/src/modules/purchases/purchases.routes.ts');
  const page = read('frontend/src/pages/PurchasesPage.js');
  const service = read('frontend/src/services/purchaseOperationsService.js');
  assert.match(route, /requirePermission\('purchases\.manage'\)/);
  assert.match(route, /prisma\.\$transaction/);
  assert.match(route, /purchaseInvoiceId/);
  assert.match(route, /purchase-cancel:/);
  assert.match(route, /Reverso por anulación/);
  assert.match(route, /Solo se eliminan compras en borrador/);
  assert.match(route, /writeAudit/);
  assert.match(page, /data-cancel-purchase/);
  assert.match(page, /PurchaseOperationsService\.cancel/);
  assert.match(page, /PurchaseOperationsService\.deleteDraft/);
  assert.doesNotMatch(page, /deletePurchase\?\./);
  assert.match(service, /\/purchases\/\$\{encodeURIComponent\(id\)\}\/cancel/);
});

test('employee profiles persist department and hire date with tenant and audit controls', () => {
  const route = read('backend/src/modules/employees/employees.routes.ts');
  const index = read('backend/src/modules/index.ts');
  const service = read('frontend/src/services/enterpriseOperationsService.js');
  const schema = read('backend/prisma/schema.prisma');
  const migration = read('backend/prisma/migrations/20260731153000_employee_department_hired_at/migration.sql');
  assert.match(route, /requirePermission\('payroll\.manage'\)/);
  assert.match(route, /"tenantId" = \$1/);
  assert.match(route, /department/);
  assert.match(route, /hiredAt/);
  assert.match(route, /writeAudit/);
  assert.match(route, /deactivate/);
  assert.match(index, /router\.use\('\/employees', employeesRoutes\)/);
  assert.match(service, /department:data\.department/);
  assert.match(service, /hiredAt:data\.hiredAt/);
  assert.match(schema, /department\s+String\?/);
  assert.match(schema, /hiredAt\s+DateTime\?/);
  assert.match(schema, /@@index\(\[tenantId, department\]\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "department"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "hiredAt"/);
});

test('deep links preserve module context and support entity selection', () => {
  const router = read('frontend/src/services/urlStateService.js');
  const enhancer = read('frontend/src/services/queryParamEnhancer.js');
  assert.match(router, /preserveCurrent/);
  assert.match(router, /patient/);
  assert.match(router, /member/);
  assert.match(enhancer, /data-gym-member/);
  assert.match(enhancer, /data-care-patient/);
});

test('Vercel sends browser security headers and current health metadata', () => {
  const vercel = read('frontend/vercel.json');
  const health = read('frontend/api/status.ts');
  assert.match(vercel, /Content-Security-Policy/);
  assert.match(vercel, /X-Frame-Options/);
  assert.match(vercel, /Permissions-Policy/);
  assert.match(vercel, /Cache-Control/);
  assert.match(health, /11\.14\.0/);
});
