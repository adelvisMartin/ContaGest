import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const rootUrl = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, rootUrl), 'utf8');

const files = [
  'frontend/src/services/runtimePolicy.js',
  'frontend/src/services/enterpriseOperationsService.js',
  'frontend/src/components/muiRuntime.js',
  'backend/src/modules/banking/banking.routes.ts',
  'backend/src/modules/payroll/payroll.routes.ts',
  'backend/src/modules/tasks/tasks.routes.ts',
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

test('deep links preserve module context and support entity selection', () => {
  const router = read('frontend/src/services/urlStateService.js');
  const enhancer = read('frontend/src/services/queryParamEnhancer.js');
  assert.match(router, /preserveCurrent/);
  assert.match(router, /patient/);
  assert.match(router, /member/);
  assert.match(enhancer, /data-gym-member/);
  assert.match(enhancer, /data-care-patient/);
});

test('Vercel sends browser security headers and v11.11 health metadata', () => {
  const vercel = read('frontend/vercel.json');
  const health = read('frontend/api/health.ts');
  assert.match(vercel, /Content-Security-Policy/);
  assert.match(vercel, /X-Frame-Options/);
  assert.match(vercel, /Permissions-Policy/);
  assert.match(vercel, /Cache-Control/);
  assert.match(health, /11\.11\.0/);
});
