import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const backendPackage = JSON.parse(readFileSync(new URL('../backend/package.json', import.meta.url), 'utf8'));

const maintainedExcelJsAlias = 'npm:@excel.js/exceljs@0.15.0';

test('issue #26 usa el fork mantenido de ExcelJS sin cambiar el nombre público del paquete', () => {
  assert.equal(
    backendPackage.dependencies?.exceljs,
    maintainedExcelJsAlias,
    'backend debe conservar el specifier exceljs mediante alias npm al fork mantenido',
  );
});

test('issue #26 no reintroduce @types/bcryptjs obsoleto', () => {
  assert.equal(
    Object.prototype.hasOwnProperty.call(backendPackage.devDependencies ?? {}, '@types/bcryptjs'),
    false,
    '@types/bcryptjs no debe volver al manifiesto del backend',
  );
});
