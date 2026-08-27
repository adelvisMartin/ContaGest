import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const stageSource = fs.readFileSync(new URL('../frontend/scripts/stage-backend.mjs', import.meta.url), 'utf8');
const backendPackage = JSON.parse(fs.readFileSync(new URL('../backend/package.json', import.meta.url), 'utf8'));

test('Vercel stages the externalized backend bundle under backend package ownership', () => {
  assert.match(stageSource, /backend\/vercel-runtime\.generated\.mjs/);
  assert.match(stageSource, /createRequire\(path\.join\(backendRoot, 'package\.json'\)\)/);
  assert.match(stageSource, /backendRequire\.resolve\(specifier\)/);
  assert.doesNotMatch(stageSource, /Promise\.all\(apiEntries\.map\(\(entry\) => writeFile\(entry, bundledApi\)\)\)/);
});

test('both API entrypoints are thin wrappers around the backend-owned runtime', () => {
  assert.match(stageSource, /\.\.\/backend\/vercel-runtime\.generated\.mjs/);
  assert.match(stageSource, /\.\.\/\.\.\/backend\/vercel-runtime\.generated\.mjs/);
  assert.match(stageSource, /export \{ default \} from/);
});

test('maintained ExcelJS alias remains the backend dependency contract', () => {
  assert.equal(backendPackage.dependencies.exceljs, 'npm:@excel.js/exceljs@0.15.0');
});

test('Supabase sync service remains syntactically valid after inventory integration', () => {
  const sourcePath = fileURLToPath(new URL('../frontend/src/services/supabaseSyncService.js', import.meta.url));
  const result = spawnSync(process.execPath, ['--check', sourcePath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
