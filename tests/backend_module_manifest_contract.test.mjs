import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const expectedMountOrder = [
  '/tenants','/clients','/suppliers','/products','/bank-accounts','/employees','/tax-periods','/sales','/purchases','/payables',
  '/approvals','/accounting','/reports','/modules','/currency','/exports','/chart-accounts','/hr','/banking','/bank-reconciliation',
  '/inventory','/payroll','/tasks','/fiscal','/analytics','/qr','/food','/notifications','/maps','/ai','/demos','/pretesting',
  '/licenses','/license-devices','/commercial','/commercial','/commercial-access','/imports','/regulatory','/rules','/rbac','/user-security',
  '/verticals','/verticals','/verticals','/verticals/veterinary','/media'
];

test('module route manifest preserves the exact legacy mount order', () => {
  const source = read('backend/src/modules/route-manifest.ts');
  const actual = [...source.matchAll(/path:\s*'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(actual, expectedMountOrder);
});

test('every module registration has an explicit architecture domain', () => {
  const source = read('backend/src/modules/route-manifest.ts');
  const rows = [...source.matchAll(/\{\s*id:\s*'([^']+)',\s*domain:\s*'([^']+)',\s*path:\s*'([^']+)'/g)];
  assert.equal(rows.length, expectedMountOrder.length);
  const allowed = new Set(['platform','financial','commercial','operations','vertical']);
  for (const [, id, domain] of rows) {
    assert.ok(id.length > 0);
    assert.ok(allowed.has(domain), `${id}: invalid domain ${domain}`);
  }
});

test('composition root keeps cross-cutting gates around the manifest mount', () => {
  const source = read('backend/src/modules/index.ts');
  assert.match(source, /import \{ mountModuleRouteManifest \} from '\.\/route-manifest\.js';/);
  const legal = source.indexOf("router.use('/legal', legalRoutes)");
  const legalAcceptance = source.indexOf('router.use(requireCurrentLegalAcceptance)');
  const subscription = source.indexOf('router.use(enforceCommercialSubscription)');
  const approval = source.indexOf('router.use(approvalExecutionGate)');
  const manifest = source.indexOf('mountModuleRouteManifest(router)');
  const dbHealth = source.indexOf("router.get('/health/db'");
  assert.ok(legal >= 0 && legal < legalAcceptance);
  assert.ok(legalAcceptance < subscription && subscription < approval && approval < manifest);
  assert.ok(manifest < dbHealth);
  assert.doesNotMatch(source, /from '\.\/verticals\//);
  assert.doesNotMatch(source, /from '\.\/sales\//);
});

test('root CI has an executable test aggregate and architecture gate', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['audit:architecture'], 'node scripts/architecture-boundary-audit.mjs');
  assert.match(pkg.scripts.test, /npm --workspace backend test/);
  assert.match(pkg.scripts.test, /tests\/\*\.test\.mjs/);
  const workflow = read('.github/workflows/ci.yml');
  assert.match(workflow, /Architecture boundaries/);
  assert.match(workflow, /npm run audit:architecture/);
});
