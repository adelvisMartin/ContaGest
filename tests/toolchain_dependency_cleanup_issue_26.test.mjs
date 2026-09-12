import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const backendPackage = JSON.parse(readFileSync(new URL('../backend/package.json', import.meta.url), 'utf8'));
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const toolchainWorkflowUrl = new URL('../.github/workflows/toolchain-deps-v26.yml', import.meta.url);
const temporaryRepairWorkflowUrl = new URL('../.github/workflows/temp-typecheck-repair.yml', import.meta.url);
const exportsRoute = readFileSync(new URL('../backend/src/modules/exports/exports.routes.ts', import.meta.url), 'utf8');
const xlsxWriter = readFileSync(new URL('../backend/src/modules/exports/xlsx-writer.ts', import.meta.url), 'utf8');
const stageBackend = readFileSync(new URL('../frontend/scripts/stage-backend.mjs', import.meta.url), 'utf8');

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

test('issue #26 mantiene el alias bloqueado mientras la regeneración determinista del lock siga pendiente', () => {
  assert.equal(backendPackage.dependencies?.exceljs, maintainedExcelJsAlias);
});

test('issue #26 mantiene package-lock sincronizado con el alias bloqueado', () => {
  assert.equal(packageLock.packages?.backend?.dependencies?.exceljs, maintainedExcelJsAlias);
  const installedExcelJs = installedPackage('exceljs');
  assert.equal(installedExcelJs?.version, '0.15.0');
});

test('issue #26 lock mantiene procedencia del fork @excel.js hasta su limpieza determinista', () => {
  const installedExcelJs = installedPackage('exceljs');
  assert.match(String(installedExcelJs?.resolved || ''), /@excel\.js\/exceljs|exceljs-0\.15\.0/i);
});

test('runtime XLSX usa writer interno y no vuelve a importar la cadena ExcelJS que rompió serverless', () => {
  assert.doesNotMatch(exportsRoute, /(?:from\s+['"]exceljs['"]|import\(['"]exceljs['"]\))/);
  assert.match(exportsRoute, /buildXlsxWorkbook/);
  assert.match(exportsRoute, /XLSX_EXPORT_LIMIT_EXCEEDED/);
  assert.match(xlsxWriter, /deflateRawSync/);
  assert.match(xlsxWriter, /t="inlineStr"/);
  assert.match(stageBackend, /forbiddenXlsxRuntime/);
  assert.match(stageBackend, /es-pako/);
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

test('issue #26 retira el workflow temporal y prueba el XLSX interno en el gate permanente', () => {
  assert.equal(existsSync(temporaryRepairWorkflowUrl), false, 'el workflow temporal one-shot no debe sobrevivir al cierre de #26');
  const workflow = readFileSync(toolchainWorkflowUrl, 'utf8');
  assert.doesNotMatch(workflow, /repair-typecheck|repair-typecheck-once|fix\/toolchain-lock-v26-finalize/);
  assert.match(workflow, /dependency-lock:/);
  assert.match(workflow, /Internal XLSX compatibility smoke/);
  assert.match(workflow, /xlsx-writer\.test\.ts/);
  assert.doesNotMatch(workflow, /import ExcelJS from ['"]exceljs['"]/);
});
