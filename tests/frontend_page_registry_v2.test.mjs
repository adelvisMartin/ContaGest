import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MODULE_VISUAL_ROUTES } from '../qa/support/module-visual-catalog.mjs';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const registryRelativePath = 'frontend/src/data/pageRegistry.js';
const registryPath = path.join(root, registryRelativePath);

test('page registry is an importable 58-route authority with visual parity', async () => {
  assert.equal(
    fs.existsSync(registryPath),
    true,
    `${registryRelativePath} must exist before app.js can delegate route authority`
  );

  const { PAGE_REGISTRY, PAGE_ROUTES } = await import(`${pathToFileURL(registryPath).href}?test=${Date.now()}`);
  assert.equal(typeof PAGE_REGISTRY, 'object');
  assert.equal(Array.isArray(PAGE_ROUTES), true);
  assert.equal(Object.keys(PAGE_REGISTRY).length, 58);
  assert.equal(PAGE_ROUTES.length, 58);
  assert.deepEqual([...PAGE_ROUTES].sort(), [...MODULE_VISUAL_ROUTES].sort());

  for (const [route, descriptor] of Object.entries(PAGE_REGISTRY)) {
    assert.ok(route.length > 0);
    assert.equal(Array.isArray(descriptor), true, `${route}: descriptor must be an array`);
    assert.equal(descriptor.length, 2, `${route}: descriptor must be [modulePath, exportName]`);
    assert.match(descriptor[0], /^\.\/pages\/.+Page(?:V\d+)?\.(?:js|jsx)$/);
    assert.match(descriptor[1], /^[A-Za-z_$][\w$]*$/);
  }
});

test('app delegates registry ownership without changing the runtime lookup contract', () => {
  const source = read('frontend/src/app.js');
  assert.match(source, /import \{ PAGE_REGISTRY as pageRegistry \} from '\.\/data\/pageRegistry\.js';/);
  assert.doesNotMatch(source, /const\s+pageRegistry\s*=\s*\{/);
  assert.match(source, /const pageModules=import\.meta\.glob\(/);
  assert.match(source, /const def=pageRegistry\[route\]/);
  assert.match(source, /routes:Object\.keys\(pageRegistry\)/);
});

test('source auditors read the registry authority instead of parsing app.js internals', () => {
  const architectureAudit = read('scripts/architecture-boundary-audit.mjs');
  const functionAudit = read('scripts/erp-module-function-audit.mjs');

  assert.match(architectureAudit, /frontend', 'src', 'data', 'pageRegistry\.js'/);
  assert.doesNotMatch(architectureAudit, /const runtimePath = path\.join\(root, 'frontend', 'src', 'app\.js'\)/);

  assert.match(functionAudit, /read\('frontend','src','data','pageRegistry\.js'\)/);
  assert.doesNotMatch(functionAudit, /const source=read\('frontend','src','app\.js'\)/);
});
