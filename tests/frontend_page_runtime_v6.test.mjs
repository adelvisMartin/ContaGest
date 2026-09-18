import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createPageResolver } from '../frontend/src/runtime/pageResolver.js';

test('page resolver loads registered exports once and caches them by route', async () => {
  let imports = 0;
  const dashboard = { render: () => '<main />' };
  const resolver = createPageResolver({
    registry: { dashboard: ['./pages/DashboardPage.js', 'DashboardPage'] },
    modules: {
      './pages/DashboardPage.js': async () => {
        imports += 1;
        return { DashboardPage: dashboard };
      }
    }
  });

  assert.equal(await resolver.loadPage('dashboard'), dashboard);
  assert.equal(await resolver.loadPage('dashboard'), dashboard);
  assert.equal(imports, 1);
});

test('page resolver preserves missing importer and missing export failures', async () => {
  const missingImporter = createPageResolver({
    registry: { ventas: ['./pages/VentasPage.js', 'VentasPage'] },
    modules: {}
  });
  await assert.rejects(() => missingImporter.loadPage('ventas'), /No se encontró el módulo de ruta: ventas/);

  const missingExport = createPageResolver({
    registry: { ventas: ['./pages/VentasPage.js', 'VentasPage'] },
    modules: { './pages/VentasPage.js': async () => ({ OtherPage: {} }) }
  });
  await assert.rejects(() => missingExport.loadPage('ventas'), /no exporta VentasPage/);
});

test('unknown non-stitch route falls back to dashboard without changing the fallback route identity', async () => {
  const dashboard = { render: () => '<main />' };
  const resolver = createPageResolver({
    registry: { dashboard: ['./pages/DashboardPage.js', 'DashboardPage'] },
    modules: { './pages/DashboardPage.js': async () => ({ DashboardPage: dashboard }) }
  });

  assert.deepEqual(await resolver.resolvePage('unknown-route'), { page: dashboard, route: 'dashboard' });
});

test('stitch routes preserve ModuleRuntimePage route forwarding', async () => {
  const calls = [];
  const resolver = createPageResolver({
    registry: {},
    modules: {},
    moduleRuntimePage: {
      render: (state, route) => {
        calls.push(['render', state, route]);
        return 'html';
      },
      mount: (state, context, route) => calls.push(['mount', state, context, route])
    }
  });

  const resolved = await resolver.resolvePage('stitch-demo');
  assert.equal(resolved.route, 'stitch-demo');
  assert.equal(resolved.page.render({ id: 1 }), 'html');
  resolved.page.mount({ id: 2 }, { ctx: true });
  assert.deepEqual(calls, [
    ['render', { id: 1 }, 'stitch-demo'],
    ['mount', { id: 2 }, { ctx: true }, 'stitch-demo']
  ]);
});

test('app keeps the canonical 58-route registry and delegates page resolution to the runtime', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'frontend/src/app.js'), 'utf8');
  const registry = fs.readFileSync(path.join(process.cwd(), 'frontend/src/data/pageRegistry.js'), 'utf8');

  assert.match(source, /PAGE_REGISTRY as pageRegistry/);
  assert.match(source, /import\.meta\.glob\(\['\.\/pages\/\*Page\.js'/);
  assert.match(source, /createPageResolver\(\{registry:pageRegistry,modules:pageModules,moduleRuntimePage:ModuleRuntimePage\}\)/);
  assert.doesNotMatch(source, /async function loadPage\(/);
  assert.doesNotMatch(source, /async function resolvePage\(/);

  const routeCount = [...registry.matchAll(/^\s*(?:'[^']+'|"[^"]+"|[\w-]+)\s*:\s*\[/gm)].length;
  assert.equal(routeCount, 58);
});
