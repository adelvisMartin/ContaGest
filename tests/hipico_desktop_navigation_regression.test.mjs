import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const css = readFileSync(resolve(root, 'frontend/public/hipico-control/assets/css/app.css'), 'utf8');

test('reports secondary navigation is hidden on desktop and only restored on mobile', () => {
  assert.match(css, /\.more-dashboard\s*\{[^}]*display:\s*none\s*;/s);
  assert.match(css, /@media\s*\(max-width:\s*780px\)[\s\S]*?\.more-dashboard\s*\{[^}]*display:\s*flex\s*;/s);
});
