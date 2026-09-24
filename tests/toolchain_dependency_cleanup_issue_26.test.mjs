import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const backendPackage = JSON.parse(readFileSync(new URL('../backend/package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const workflow = readFileSync(new URL('../.github/workflows/toolchain-deps-v26.yml', import.meta.url), 'utf8');

const retiredXlsxPackages = new Set(['exceljs', '@excel.js/exceljs', '@excel.js/jszip', '@excel.js/archiver', '@excel.js/unzipper', 'es-pako']);
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

test('issue #26 mantiene retirado ExcelJS porque producción usa el writer XLSX interno', () => {
  assert.equal(
    Object.prototype.hasOwnProperty.call(backendPackage.dependencies ?? {}, 'exceljs'),
    false,
    'backend no debe reinstalar el fork ExcelJS retirado del bootstrap serverless',
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(packageLock.packages?.backend?.dependencies ?? {}, 'exceljs'),
    false,
    'package-lock no debe declarar ExcelJS como dependencia del workspace backend',
  );
});

test('issue #26 lock no materializa la cadena ExcelJS/JSZip/es-pako retirada', () => {
  const matches = [];
  for (const [lockPath, metadata] of Object.entries(packageLock.packages ?? {})) {
    if (!metadata || typeof metadata !== 'object') continue;
    const packageName = packageNameFromLockPath(lockPath);
    const declaredName = typeof metadata.name === 'string' ? metadata.name : null;
    if ((packageName && retiredXlsxPackages.has(packageName)) || (declaredName && retiredXlsxPackages.has(declaredName))) {
      matches.push(`${declaredName || packageName} (${lockPath})`);
    }
  }
  assert.deepEqual(matches, [], `package-lock reintrodujo la cadena XLSX retirada: ${matches.join(', ')}`);
});

test('issue #221 toolchain verifica el bundle serverless después del writer XLSX interno', () => {
  assert.match(workflow, /Internal XLSX writer smoke/);
  assert.match(workflow, /node frontend\/scripts\/stage-backend\.mjs/);
  assert.doesNotMatch(workflow, /import\s+ExcelJS\s+from\s+['"]exceljs['"]/);
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

test('issue #26 lock uses patched security transitive versions', () => {
  const deepmerge=packageLock.packages?.['node_modules/deepmerge-ts']?.version;
  const qs=packageLock.packages?.['node_modules/qs']?.version;
  assert.equal(deepmerge,'8.0.1','Prisma config must resolve the patched deepmerge-ts');
  assert.equal(qs,'6.16.0','Express/body-parser must resolve patched qs');
});

test('issue #26 workflow explicitly refreshes security overrides during deterministic lock regeneration', () => {
  assert.match(workflow,/npm update deepmerge-ts qs --package-lock-only/);
});
