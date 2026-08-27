import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MODULE_VISUAL_CATALOG } from '../qa/support/module-visual-catalog.mjs';

const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const workflow = readFileSync(new URL('../.github/workflows/accessibility-wcag22-v99.yml', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../docs/qa/ACCESSIBILITY_WCAG22.md', import.meta.url), 'utf8');
const waivers = JSON.parse(readFileSync(new URL('../qa/accessibility-waivers-v99.json', import.meta.url), 'utf8'));
const spec = readFileSync(new URL('../qa/accessibility-wcag22-v99.spec.mjs', import.meta.url), 'utf8');

test('issue #99 mantiene el catálogo vigente de 58 rutas como fuente del gate', () => {
  assert.equal(MODULE_VISUAL_CATALOG.length, 58);
  assert.match(spec, /MODULE_VISUAL_CATALOG/);
  assert.doesNotMatch(spec, /const\s+ROUTES\s*=\s*\[/);
});

test('issue #99 expone un script de QA accesible y un job con nombre estable', () => {
  assert.equal(rootPackage.scripts?.['test:browser:a11y'], 'playwright test qa/accessibility-wcag22-v99.spec.mjs --project=chromium --workers=1');
  assert.match(workflow, /name:\s*wcag22-aa/);
  assert.match(workflow, /npm run test:browser:a11y/);
  assert.match(workflow, /npm run test:browser:contrast/);
  assert.match(workflow, /artifacts\/qa\/accessibility-v99/);
});

test('issue #99 conserva waivers explícitos, vacíos por defecto y documentados', () => {
  assert.deepEqual(waivers, []);
  assert.match(docs, /owner/);
  assert.match(docs, /justification/);
  assert.match(docs, /reviewAfter/);
});

test('issue #99 documenta estados de evidencia sin convertir BLOCKED en PASS', () => {
  for (const state of ['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED']) assert.match(docs, new RegExp(`\\b${state}\\b`));
  assert.match(docs, /Nunca convertir `BLOCKED` o `NOT_EXECUTED` en PASS/);
});
