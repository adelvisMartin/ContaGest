import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Regresses a real Vite import-analysis failure before launching the 60-state
// visual matrix; no source rewriting or alternative UI implementation.
test('#v4951 MUI runtime is syntactically valid for the real browser build', () => {
  const source = fileURLToPath(new URL('../frontend/src/components/muiRuntime.js', import.meta.url));
  const result = spawnSync(process.execPath, ['--check', source], { encoding: 'utf8' });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr || result.stdout || 'MUI source syntax check failed');
});
