import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const backendPackage = JSON.parse(readFileSync(new URL('../backend/package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

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

test('issue #26 usa el fork mantenido de ExcelJS sin cambiar el nombre público del paquete', () => {
  assert.equal(
    backendPackage.dependencies?.exceljs,
    maintainedExcelJsAlias,
    'backend debe conservar el specifier exceljs mediante alias npm al fork mantenido',
  );
});

test('issue #26 mantiene package-lock sincronizado con el alias mantenido', () => {
  assert.equal(
    packageLock.packages?.backend?.dependencies?.exceljs,
    maintainedExcelJsAlias,
    'package-lock debe declarar el mismo alias de ExcelJS que backend/package.json',
  );

  const installedExcelJs = packageLock.packages?.['node_modules/exceljs'];
  assert.equal(installedExcelJs?.version, '0.15.0', 'el lock debe materializar @excel.js/exceljs 0.15.0 bajo el specifier exceljs');
});

test('issue #26 lock mantiene procedencia del fork @excel.js', () => {
  const installedExcelJs = packageLock.packages?.['node_modules/exceljs'];
  assert.match(
    String(installedExcelJs?.resolved || ''),
    /@excel\.js\/exceljs|exceljs-0\.15\.0/i,
    'el lock debe resolver el alias mantenido y no el paquete legacy 4.x',
  );
});

test('issue #26 no contiene las versiones transitorias obsoletas objetivo en package-lock', () => {
  const matches = [];
  for (const [lockPath, metadata] of Object.entries(packageLock.packages ?? {})) {
    const packageName = packageNameFromLockPath(lockPath);
    if (!packageName || !metadata || typeof metadata !== 'object') continue;
    const bannedVersion = bannedTransitiveVersions.get(packageName);
    if (bannedVersion && metadata.version === bannedVersion) {
      matches.push(`${packageName}@${metadata.version} (${lockPath})`);
    }
  }

  assert.deepEqual(matches, [], `package-lock reintrodujo dependencias obsoletas: ${matches.join(', ')}`);
});

test('issue #26 no reintroduce @types/bcryptjs obsoleto', () => {
  assert.equal(
    Object.prototype.hasOwnProperty.call(backendPackage.devDependencies ?? {}, '@types/bcryptjs'),
    false,
    '@types/bcryptjs no debe volver al manifiesto del backend',
  );
});
