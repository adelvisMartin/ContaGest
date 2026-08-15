import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('ERP runtime loads v11.27 stability layer last', () => {
  const css = read('frontend/src/styles/erp-runtime.css');
  const imports = [...css.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.equal(imports.at(-1), './shell-stability-v1127.css');
});

test('shell stability contract suppresses legacy duplicate pseudo icons', () => {
  const css = read('frontend/src/styles/shell-stability-v1127.css');
  assert.match(css, /theme-toggle.*::before/s);
  assert.match(css, /content:\s*none\s*!important/);
  assert.match(css, /--cg-sidebar-light-bg:\s*#f7faff/);
  assert.match(css, /min-height:\s*var\(--cg-control-h\)/);
});

test('runtime shell exposes only light and dark themes', () => {
  const catalog = read('frontend/src/config/themeCatalog.js');
  assert.match(catalog, /value:\s*['"]light['"]/);
  assert.match(catalog, /value:\s*['"]dark['"]/);
  for (const deprecated of ['sky', 'soft-blue', 'ocean', 'forest', 'spectrum', 'executive', 'finance', 'enterprise']) {
    assert.doesNotMatch(catalog, new RegExp(`value:\\s*['"]${deprecated}['"]`));
  }
});

test('Control Hipico legacy route is isolated from ContaGest SPA modules', () => {
  const config = JSON.parse(read('vercel.json'));
  const redirects = config.redirects || [];
  assert.ok(redirects.some((r) => r.source === '/control-hipico' && r.destination === '/hipico-control/'));
  assert.ok(redirects.some((r) => r.source === '/control-hipico/:path*' && r.destination === '/hipico-control/:path*'));
});

test('QA audit refuses to label heuristic maturity as 100 percent', () => {
  const audit = read('docs/QA_FODA_SYSTEM_AUDIT_2026-08-15.md');
  assert.match(audit, /0 módulos quedan certificados al 100%/);
  assert.match(audit, /CRUD real/);
  assert.match(audit, /WCAG 2\.2 AA/);
  assert.match(audit, /pretesting.*heurístico/is);
});

test('external skill review forbids blind hooks and secret access', () => {
  const security = read('docs/EXTERNAL_AGENT_SKILLS_SECURITY_REVIEW_2026-08-15.md');
  assert.match(security, /no se instalan hooks/i);
  assert.match(security, /prompt injection/i);
  assert.match(security, /force-push/i);
  assert.match(security, /shadow por defecto/i);
});
