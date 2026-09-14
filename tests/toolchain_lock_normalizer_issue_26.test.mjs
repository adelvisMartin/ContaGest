import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const normalizer = path.resolve('scripts/normalize-package-lock-v26.mjs');

function staleLock({ sharedDayjs = false } = {}) {
  return {
    name: 'fixture', version: '1.0.0', lockfileVersion: 3, requires: true,
    packages: {
      '': { name: 'fixture', version: '1.0.0' },
      backend: { dependencies: { exceljs: 'npm:@excel.js/exceljs@0.15.0', express: '5.2.1' } },
      'backend/node_modules/exceljs': { name: '@excel.js/exceljs', version: '0.15.0', dependencies: { '@excel.js/jszip': '0.2.0', dayjs: '^1.8.34', 'fast-csv': '^5.0.5', saxes: '^6.0.0', tmp: '^0.2.0' } },
      'backend/node_modules/fast-csv': { version: '5.0.7', dependencies: { '@fast-csv/format': '5.0.7', '@fast-csv/parse': '5.0.7' } },
      'backend/node_modules/@fast-csv/format': { version: '5.0.7', dependencies: { 'lodash.escaperegexp': '^4.1.2' } },
      'backend/node_modules/@fast-csv/parse': { version: '5.0.7', dependencies: { 'lodash.escaperegexp': '^4.1.2', 'lodash.groupby': '^4.6.0', 'lodash.uniq': '^4.5.0' } },
      'backend/node_modules/saxes': { version: '6.0.0', dependencies: { xmlchars: '^2.2.0' } },
      'node_modules/@excel.js/jszip': { version: '0.2.0', dependencies: { 'es-pako': '0.1.0' } },
      'node_modules/dayjs': { version: '1.11.21' },
      'node_modules/es-pako': { version: '0.1.0' },
      'node_modules/tmp': { version: '0.2.7' },
      'node_modules/lodash.escaperegexp': { version: '4.1.2' },
      'node_modules/lodash.groupby': { version: '4.6.0' },
      'node_modules/lodash.uniq': { version: '4.5.0' },
      'node_modules/xmlchars': { version: '2.2.0' },
      'node_modules/express': sharedDayjs ? { version: '5.2.1', dependencies: { dayjs: '^1.11.0' } } : { version: '5.2.1' },
    },
  };
}

async function runFixture(lock, extraArgs = []) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lock-v26-'));
  const file = path.join(dir, 'package-lock.json');
  await writeFile(file, `${JSON.stringify(lock, null, 2)}\n`);
  const result = spawnSync(process.execPath, [normalizer, '--lockfile', file, ...extraArgs], { encoding: 'utf8' });
  return { file, result, parsed: result.status === 0 ? JSON.parse(await readFile(file, 'utf8')) : null };
}

test('normalizer removes retired XLSX chain and proven orphan descendants', async () => {
  const { result, parsed } = await runFixture(staleLock());
  assert.equal(result.status, 0, result.stderr);
  assert.equal('exceljs' in parsed.packages.backend.dependencies, false);
  for (const key of [
    'backend/node_modules/exceljs', 'backend/node_modules/fast-csv',
    'backend/node_modules/@fast-csv/format', 'backend/node_modules/@fast-csv/parse',
    'backend/node_modules/saxes', 'node_modules/@excel.js/jszip', 'node_modules/dayjs',
    'node_modules/es-pako', 'node_modules/tmp', 'node_modules/lodash.escaperegexp',
    'node_modules/lodash.groupby', 'node_modules/lodash.uniq', 'node_modules/xmlchars',
  ]) assert.equal(key in parsed.packages, false, key);
  assert.equal(parsed.packages['node_modules/express'].version, '5.2.1');
});

test('normalizer fails closed if a surviving package still references a candidate orphan', async () => {
  const { result } = await runFixture(staleLock({ sharedDayjs: true }));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LOCK_NORMALIZATION_SHARED_DEPENDENCY:dayjs/);
});

test('--check reports drift without mutating the lockfile', async () => {
  const original = `${JSON.stringify(staleLock(), null, 2)}\n`;
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lock-v26-check-'));
  const file = path.join(dir, 'package-lock.json');
  await writeFile(file, original);
  const result = spawnSync(process.execPath, [normalizer, '--lockfile', file, '--check'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PACKAGE_LOCK_NORMALIZATION_REQUIRED/);
  assert.equal(await readFile(file, 'utf8'), original);
});
