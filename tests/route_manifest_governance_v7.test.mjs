import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  extractRouteManifestEntries,
  validateRouteManifestSource
} from '../scripts/architecture-boundary-audit.mjs';

const manifestPath = path.join(process.cwd(), 'backend/src/modules/route-manifest.ts');
const currentSource = () => fs.readFileSync(manifestPath, 'utf8');

const EXPECTED_IDS = [
  'tenants','clients','suppliers','products','bank-accounts','employees','tax-periods','sales','purchases','payables',
  'approvals','accounting','reports','modules','currency','exports','chart-accounts','hr','banking','bank-reconciliation',
  'inventory','payroll','tasks','fiscal','analytics','qr','food','notifications','maps','ai','demos','pretesting',
  'licenses','license-devices','service-restrictions','commercial','commercial-access','imports','regulatory','rules','rbac',
  'user-security','vertical-core','veterinary-crud','vertical-extended','veterinary','media'
];

test('route manifest keeps exact router identity order, including duplicate mount paths', () => {
  const entries = extractRouteManifestEntries(currentSource());
  assert.deepEqual(entries.map((entry) => entry.id), EXPECTED_IDS);
  assert.equal(entries.length, 47);
});

test('current route manifest satisfies governance invariants', () => {
  const result = validateRouteManifestSource(currentSource());
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.entryCount, EXPECTED_IDS.length);
});

test('route manifest governance rejects duplicate ids and malformed paths', () => {
  const source = [
    "import salesRoutes from './sales/sales.routes.js';",
    "import purchaseRoutes from './purchases/purchases.routes.js';",
    "export const MODULE_ROUTE_MANIFEST = Object.freeze([",
    "  { id: 'sales', domain: 'commercial', path: '/sales', router: salesRoutes },",
    "  { id: 'sales', domain: 'commercial', path: 'purchases/', router: purchaseRoutes }",
    "]);"
  ].join('\n');

  const result = validateRouteManifestSource(source, { expectedOrder: ['sales', 'sales'] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('duplicate route manifest ids: sales')));
  assert.ok(result.errors.some((error) => error.includes("invalid route manifest path purchases/")));
});

test('route manifest governance rejects undocumented duplicate mounts', () => {
  const source = [
    "import firstRoutes from './sales/sales.routes.js';",
    "import secondRoutes from './purchases/purchases.routes.js';",
    "export const MODULE_ROUTE_MANIFEST = Object.freeze([",
    "  { id: 'first', domain: 'commercial', path: '/shared', router: firstRoutes },",
    "  { id: 'second', domain: 'commercial', path: '/shared', router: secondRoutes }",
    "]);"
  ].join('\n');

  const result = validateRouteManifestSource(source, { expectedOrder: ['first', 'second'] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('undocumented duplicate mount /shared')));
});

test('route manifest governance rejects drift inside an allowed duplicate mount', () => {
  const source = currentSource().replace(
    "{ id: 'service-restrictions', domain: 'commercial', path: '/commercial', router: serviceRestrictionRoutes },\n  { id: 'commercial', domain: 'commercial', path: '/commercial', router: commercialRoutes },",
    "{ id: 'commercial', domain: 'commercial', path: '/commercial', router: commercialRoutes },\n  { id: 'service-restrictions', domain: 'commercial', path: '/commercial', router: serviceRestrictionRoutes },"
  );

  const result = validateRouteManifestSource(source);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('duplicate mount /commercial order')));
  assert.ok(result.errors.some((error) => error.includes('route manifest order drift')));
});

test('route manifest governance rejects optional-pack routers declared as core domains', () => {
  const source = currentSource().replace(
    "{ id: 'food', domain: 'vertical', path: '/food', router: foodRoutes },",
    "{ id: 'food', domain: 'operations', path: '/food', router: foodRoutes },"
  );

  const result = validateRouteManifestSource(source);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('optional-pack router foodRoutes must use vertical domain')));
});

test('route manifest governance rejects entries missing an explicit domain', () => {
  const source = currentSource().replace(
    "{ id: 'media', domain: 'platform', path: '/media', router: mediaRoutes }",
    "{ id: 'media', path: '/media', router: mediaRoutes }"
  );

  const result = validateRouteManifestSource(source);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('unparseable route manifest entries')));
});
