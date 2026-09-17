import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  auditRepositoryArchitecture,
  compareRouteAuthorities,
  extractPageRegistryRoutes,
  extractVisualCatalogRoutes,
  findForbiddenBackendDependencies
} from '../scripts/architecture-boundary-audit.mjs';

const runtimeSource = `const pageRegistry={\n dashboard:['./pages/DashboardPage.js','DashboardPage'],'libro-mayor':['./pages/GeneralLedgerPage.js','GeneralLedgerPage'],veterinaria:['./pages/VeterinaryClinicPage.jsx','VeterinaryClinicPage']\n};`;
const catalogSource = `export const MODULE_VISUAL_CATALOG = Object.freeze([\n { route:'dashboard', family:'core' },\n { route:'libro-mayor', family:'accounting' },\n { route:'veterinaria', family:'health' }\n]);`;

test('extractors keep runtime and visual route identities stable', () => {
  assert.deepEqual(extractPageRegistryRoutes(runtimeSource), ['dashboard','libro-mayor','veterinaria']);
  assert.deepEqual(extractVisualCatalogRoutes(catalogSource), ['dashboard','libro-mayor','veterinaria']);
});

test('route authority comparison rejects drift and duplicate catalog rows', () => {
  const result = compareRouteAuthorities(
    ['dashboard','ventas','veterinaria'],
    ['dashboard','ventas','ventas'],
    { expectedCount: 3 }
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((item) => item.includes('missing from visual catalog: veterinaria')));
  assert.ok(result.errors.some((item) => item.includes('duplicate visual catalog routes: ventas')));
});

test('core modules may not depend on optional vertical packs', () => {
  const findings = findForbiddenBackendDependencies([
    {
      path: '/repo/backend/src/modules/accounting/accounting.routes.ts',
      source: `import verticalRoutes from '../verticals/verticals.routes.js';`
    },
    {
      path: '/repo/backend/src/modules/verticals/veterinary.routes.ts',
      source: `import { requireTenant } from '../../shared/middleware/context.js';`
    },
    {
      path: '/repo/backend/src/modules/index.ts',
      source: `import verticalRoutes from './verticals/verticals.routes.js';`
    }
  ]);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /accounting\.routes\.ts/);
  assert.match(findings[0], /verticals\/verticals\.routes/);
});

test('repository audit binds route parity and dependency direction in one deterministic result', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contagest-arch-'));
  fs.mkdirSync(path.join(root, 'frontend/src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'qa/support'), { recursive: true });
  fs.mkdirSync(path.join(root, 'backend/src/modules/accounting'), { recursive: true });
  fs.writeFileSync(path.join(root, 'frontend/src/app.js'), runtimeSource);
  fs.writeFileSync(path.join(root, 'qa/support/module-visual-catalog.mjs'), catalogSource);
  fs.writeFileSync(path.join(root, 'backend/src/modules/accounting/accounting.routes.ts'), `import { prisma } from '../../database/prisma.js';`);

  const result = auditRepositoryArchitecture(root, { expectedRouteCount: 3 });
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.runtimeRouteCount, 3);
  assert.equal(result.visualRouteCount, 3);
  assert.deepEqual(result.errors, []);
});

test('current ContaGest tree satisfies the executable architecture contract', () => {
  const result = auditRepositoryArchitecture(process.cwd());
  assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  assert.equal(result.runtimeRouteCount, 58);
  assert.equal(result.visualRouteCount, 58);
});
