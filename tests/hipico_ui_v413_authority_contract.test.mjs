import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HIPICO_VISUAL_BASELINES } from '../qa/support/hipico-visual-baselines.mjs';
import { missingVisualBaselines } from '../scripts/hipico-visual-baseline-gate.mjs';

const read = (path) => readFileSync(join(process.cwd(), path), 'utf8');
const entry = read('frontend/public/hipico-control/assets/css/app.css');
const convergence = read('frontend/public/hipico-control/assets/css/ui-system-v4-convergence.css');
const sw = read('frontend/public/hipico-control/sw.js');
const visualSpec = read('qa/hipico-ui-v41-shell.spec.mjs');
const baselineGate = read('scripts/hipico-visual-baseline-gate.mjs');

test('app.css is import-only and keeps legacy below v4 convergence', () => {
  assert.match(entry, /@import url\("\.\/ui-system-v3-compat\.css"\) layer\(legacy\)/);
  assert.match(entry, /@import url\("\.\/ui-system-v4\.css"\)/);
  assert.match(entry, /@import url\("\.\/ui-system-v4-convergence\.css"\)/);
  const executableRules = entry.split('\n').filter((line) => line.trim() && !line.trim().startsWith('/*') && !line.trim().startsWith('*') && !line.trim().startsWith('@'));
  assert.deepEqual(executableRules, []);
});

test('convergence authority owns overlays icons floating utilities and reduced motion', () => {
  assert.match(convergence, /\.hc-help-trigger/);
  assert.match(convergence, /\.ops-launcher/);
  assert.match(convergence, /\.modal-backdrop/);
  assert.match(convergence, /\.toast\s*\{/);
  assert.match(convergence, /prefers-reduced-motion/);
});

test('visual baseline manifest matches the reviewed Playwright contract', () => {
  assert.equal(HIPICO_VISUAL_BASELINES.length, 10);
  for (const baseline of HIPICO_VISUAL_BASELINES) assert.match(visualSpec, new RegExp(baseline.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('baseline updater refuses CI and reports missing baselines instead of fabricating green', () => {
  assert.match(baselineGate, /if \(process\.env\.CI\)/);
  assert.match(baselineGate, /REFUSED: visual baselines are review artifacts and cannot be updated in CI/);
  assert.match(baselineGate, /BASELINE_REQUIRED/);
  assert.match(baselineGate, /--update-snapshots/);
  assert.deepEqual(missingVisualBaselines(HIPICO_VISUAL_BASELINES.map((name) => `${name}-chromium-linux.png`)), []);
});

test('PWA caches v4.1.3 convergence authority under a rotated shell', () => {
  assert.match(sw, /shell-r34-ui-v4-1-3-authority/);
  assert.match(sw, /ui-system-v4-convergence\.css/);
});
