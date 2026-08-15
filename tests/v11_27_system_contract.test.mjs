import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('critical v11.27 shell invariants are registered in the first cascade layer', () => {
  const css = read('frontend/src/styles/erp-runtime.css');
  assert.match(css, /@layer\s+cg\.shell-contract,\s*cg\.context/);
  assert.match(css, /@import\s+['"]\.\/shell-stability-v1127\.css['"]\s+layer\(cg\.shell-contract\)/);
  assert.ok(css.indexOf("shell-stability-v1127.css") < css.indexOf("erp-system.css"));
});

test('light sidebar contract targets the selectors actually rendered by layout.js', () => {
  const css = read('frontend/src/styles/shell-stability-v1127.css');
  const layout = read('frontend/src/components/layout.js');
  assert.match(layout, /id="sidebar" class="hf-sidebar hf-app-sidebar cg-sidebar/);
  assert.match(layout, /id="mainMenu"/);
  assert.match(layout, /menu-link hf-menu-item/);
  assert.match(css, /#sidebar\.hf-sidebar\.hf-app-sidebar\.cg-sidebar/);
  assert.match(css, /#mainMenu button\.menu-link\.hf-menu-item/);
  assert.match(css, /--cg-sidebar-light-bg:\s*#f8fafc/);
});

test('runtime theme switch is binary and old persisted palettes migrate to light', () => {
  const catalog = read('frontend/src/data/themeCatalog.js');
  const optionsBlock = catalog.match(/export const THEME_OPTIONS[\s\S]*?\]\);/)?.[0] || '';
  assert.match(optionsBlock, /key:'light'/);
  assert.match(optionsBlock, /key:'dark'/);
  for (const deprecated of ['sector','sky','soft-blue','ocean','forest','celestial','spectrum','executive','finance','enterprise']) {
    assert.doesNotMatch(optionsBlock, new RegExp(`key:'${deprecated}'`));
  }
  const store = read('frontend/src/state/store.js');
  assert.match(store, /OFFICIAL_THEMES = new Set\(\['light','dark'\]\)/);
  assert.match(store, /return OFFICIAL_THEMES\.has\(value\) \? value : 'light'/);
});

test('session guard uses authenticated session identity and client routes stay license scoped', () => {
  const guard = read('frontend/src/services/sessionAccessGuard.js');
  assert.match(guard, /import \{ AuthSession \} from '\.\/authSession\.js'/);
  assert.match(guard, /const session = AuthSession\.get\(\)/);
  assert.match(guard, /if \(identity\.isClient\)/);
  assert.match(guard, /if \(!validLicense\(license\)\) return false/);
  assert.match(guard, /!license\.modules\.includes\(route\)/);
});

test('breadcrumbs use one desktop owner and expose only current module on mobile', () => {
  const css = read('frontend/src/styles/shell-stability-v1127.css');
  const runtime = read('frontend/src/components/muiRuntime.js');
  assert.match(runtime, /mui-breadcrumbs-ready/);
  assert.match(css, /\.hf-breadcrumbs-host\.mui-breadcrumbs-ready \.hf-breadcrumbs-fallback/);
  assert.match(css, /\.hf-breadcrumbs-host \[data-mui-breadcrumb-mount\]\s*\{\s*display:\s*none\s*!important/s);
  assert.match(css, /\.hf-breadcrumbs-fallback \.hf-breadcrumb-current/);
});

test('fitness productivity tools are mounted and protein suggestions include local substitutes', () => {
  const runtime = read('frontend/src/services/queryParamEnhancer.js');
  const nutrition = read('frontend/src/services/fitnessNutritionService.js');
  const enhancer = read('frontend/src/services/fitnessProductivityEnhancer.js');
  assert.match(runtime, /FitnessProductivityEnhancer\.mount\(Store\.get\(\),\{Store,Toast\}\)/);
  assert.match(nutrition, /Tostadas integrales con pavo[\s\S]*pollo desmechado[\s\S]*huevos \+ claras[\s\S]*atún al natural/);
  assert.match(nutrition, /Pescado blanco con papa y ensalada[\s\S]*atún o sardinas[\s\S]*pollo[\s\S]*huevos \+ claras/);
  assert.match(enhancer, /Proteína alternativa:/);
  assert.match(enhancer, /sustituciones de proteína para adaptar disponibilidad local/);
});

test('Control Hipico remains a separate product route and never an ERP module', () => {
  const config = JSON.parse(read('vercel.json'));
  const routes = config.routes || [];
  assert.ok(routes.some((r) => r.src === '/control-hipico' && r.status === 308 && r.headers?.Location === '/hipico-control/'));
  assert.ok(routes.some((r) => r.src === '/control-hipico/(.*)' && r.status === 308 && r.headers?.Location === '/hipico-control/$1'));
  const modules = read('frontend/src/data/moduleCatalog.js');
  assert.doesNotMatch(modules, /control-hipico|hipico-control/i);
  const manifest = JSON.parse(read('frontend/public/hipico-control/manifest.webmanifest'));
  assert.equal(manifest.scope, '/hipico-control/');
});

test('product-boundary ADR explicitly forbids ERP/Hipico UI and release coupling', () => {
  const doc = read('docs/architecture/PRODUCT_BOUNDARIES_CONTAGEST_HIPICO.md');
  assert.match(doc, /productos independientes/i);
  assert.match(doc, /MODULE_CATALOG/);
  assert.match(doc, /base de datos compartida/i);
  assert.match(doc, /release/i);
});

test('QA audit still refuses to label heuristic maturity as 100 percent', () => {
  const audit = read('docs/QA_FODA_SYSTEM_AUDIT_2026-08-15.md');
  assert.match(audit, /0 módulos quedan certificados al 100%/);
  assert.match(audit, /CRUD real/);
  assert.match(audit, /WCAG 2\.2 AA/);
});
