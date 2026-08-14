import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('canonical cascade owns shared shell geometry after contextual accents', async () => {
  const entry = await read('frontend/src/styles/compact-enterprise-v1110.css');
  const canonical = await read('frontend/src/styles/erp-system.css');
  assert.match(entry, /vertical-contexts\.css' layer\(cg\.context\)/);
  assert.match(entry, /@import '\.\/erp-system\.css'/);
  assert.match(canonical, /grid-template-columns:auto 34px minmax\(0,1fr\)/);
  assert.match(canonical, /\.hf-header-brand \{ display:grid !important;/);
  assert.match(canonical, /\.hf-command-trigger \{ display:grid !important;/);
  assert.match(canonical, /\.hf-rate-compact \{ display:flex !important; width:auto !important; max-width:76px/);
  assert.doesNotMatch(canonical, /\.hf-header-brand \{ display:none !important;/);
});

test('MUI migration renders one static ERP label instead of a floating duplicate', async () => {
  const css = await read('frontend/src/styles/mui-global-runtime.css');
  assert.match(css, /data-mui-native-prepared="true"/);
  assert.match(css, /data-mui-select-prepared="true"/);
  assert.match(css, /MuiInputLabel-root/);
  assert.match(css, /clip-path:inset\(50%\)!important/);
  assert.match(css, /MuiOutlinedInput-notchedOutline legend/);
});

test('shared responsive contract protects module width and action/form overlap', async () => {
  const css = await read('frontend/src/styles/erp-system.css');
  assert.match(css, /cgx-module-standard/);
  assert.match(css, /cgx-page-actions/);
  assert.match(css, /cg-row-actions/);
  assert.match(css, /MuiFormControl-root/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /cg-form-grid-2.*grid-template-columns:minmax\(0,1fr\)/s);
});

test('API applies layered rate limits to writes and resource-intensive routes', async () => {
  const security = await read('backend/src/shared/middleware/security.ts');
  const app = await read('backend/src/app.ts');
  assert.match(security, /export const mutationRateLimit = rateLimit/);
  assert.match(security, /limit: isProd \? 45 : 180/);
  assert.match(security, /export const expensiveOperationRateLimit = rateLimit/);
  assert.match(security, /limit: isProd \? 12 : 60/);
  assert.match(app, /\['\/api\/v1\/ai', '\/api\/v1\/exports', '\/api\/v1\/imports', '\/api\/v1\/reports'\]/);
  assert.match(app, /app\.use\('\/api\/v1', mutationRateLimit, requestContext, apiRoutes\)/);
  assert.match(app, /app\.use\('\/api\/v1\/auth', authRateLimit, authRoutes\)/);
});

test('all-route mobile QA includes psychology and overlap audits', async () => {
  const qa = await read('qa/responsive-all-routes.spec.mjs');
  assert.match(qa, /'psicologia'/);
  assert.match(qa, /fieldOverlaps/);
  assert.match(qa, /actionOverlaps/);
  assert.match(qa, /psychology migrated fields expose one visible label per control/);
  assert.match(qa, /#btnUserMenu/);
});
