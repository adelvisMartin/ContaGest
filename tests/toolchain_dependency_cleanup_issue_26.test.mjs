import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const backendPackage = JSON.parse(readFileSync(new URL('../backend/package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const workflow = readFileSync(new URL('../.github/workflows/toolchain-deps-v26.yml', import.meta.url), 'utf8');

const maintainedExcelJsAlias = 'npm:@excel.js/exceljs@0.15.0';
const bannedTransitiveVersions = new Map([
  ['rimraf', '2.7.1'],
  ['lodash.isequal', '4.5.0'],
  ['inflight', '1.0.6'],
  ['glob', '7.2.3'],
  ['fstream', '1.0.12'],
  ['uuid', '8.3.2'],
]);

function packageNameFromLockPath(lockPath) {
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  if (index === -1) return null;
  return lockPath.slice(index + marker.length);
}

function installedPackage(name) {
  const entries = Object.entries(packageLock.packages ?? {}).filter(([lockPath]) => packageNameFromLockPath(lockPath) === name);
  assert.equal(entries.length, 1, `package-lock debe materializar exactamente una copia de ${name}; encontrados: ${entries.map(([path]) => path).join(', ')}`);
  return entries[0][1];
}

test('issue #26 conserva temporalmente el alias bloqueado sólo en manifiesto/lock hasta poder regenerar npm', () => {
  assert.equal(backendPackage.dependencies?.exceljs, maintainedExcelJsAlias);
  assert.equal(packageLock.packages?.backend?.dependencies?.exceljs, maintainedExcelJsAlias);
  const installedExcelJs = installedPackage('exceljs');
  assert.equal(installedExcelJs?.version, '0.15.0');
});

test('issue #221 impide que CI vuelva a ejecutar el runtime ExcelJS roto o un repair job one-shot', () => {
  assert.doesNotMatch(workflow, /repair-typecheck-once|fix\/toolchain-lock-v26-finalize|Narrow account row before parentCode access/);
  assert.doesNotMatch(workflow, /import\s+ExcelJS\s+from\s+['"]exceljs['"]/);
  assert.match(workflow, /xlsx-writer\.test\.ts/);
  assert.match(workflow, /stage-backend\.mjs/);
});

test('issue #26 lock mantiene procedencia del fork @excel.js mientras el lock no pueda regenerarse', () => {
  const installedExcelJs = installedPackage('exceljs');
  assert.match(String(installedExcelJs?.resolved || ''), /@excel\.js\/exceljs|exceljs-0\.15\.0/i);
});

test('issue #26 no contiene las versiones transitorias obsoletas objetivo en package-lock', () => {
  const matches = [];
  for (const [lockPath, metadata] of Object.entries(packageLock.packages ?? {})) {
    const packageName = packageNameFromLockPath(lockPath);
    if (!packageName || !metadata || typeof metadata !== 'object') continue;
    const bannedVersion = bannedTransitiveVersions.get(packageName);
    if (bannedVersion && metadata.version === bannedVersion) matches.push(`${packageName}@${metadata.version} (${lockPath})`);
  }
  assert.deepEqual(matches, [], `package-lock reintrodujo dependencias obsoletas: ${matches.join(', ')}`);
});

test('issue #26 no reintroduce @types/bcryptjs obsoleto', () => {
  assert.equal(Object.prototype.hasOwnProperty.call(backendPackage.devDependencies ?? {}, '@types/bcryptjs'), false);
});
