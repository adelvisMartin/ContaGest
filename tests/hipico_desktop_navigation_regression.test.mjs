import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cssFile = (name) => readFileSync(resolve(root, 'frontend/public/hipico-control/assets/css', name), 'utf8');

test('reports secondary navigation stays hidden; canonical mobile navigation remains available', () => {
  // UI System v4 replaced the old reports-only bar with the canonical bottom nav.
  // Keep this negative test for duplicate competing nav on desktop and mobile.
  const legacy = cssFile('ui-system-v3-compat.css');
  const v4 = cssFile('ui-system-v4.css');
  assert.match(v4, /\.more-dashboard\s*\{[^}]*display:\s*none\s*;/s);
  assert.match(v4, /@media\s*\(max-width:\s*780px\)[\s\S]*?\.more-dashboard\s*\{[^}]*display:\s*none\s*!important\s*;/s);
  assert.match(legacy, /\.mobile-nav\s*\{[^}]*display:\s*none\s*;/s);
  assert.match(legacy, /@media\s*\(max-width:\s*780px\)[\s\S]*?\.mobile-nav\s*\{[^}]*display:\s*grid\s*;/s);
  assert.match(legacy, /\.mobile-nav button\s*\{[^}]*min-height:\s*var\(--hc-touch\)/s);
});
