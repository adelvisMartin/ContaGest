# Issue #26 · Limpieza de dependencias transitorias obsoletas

## Objetivo

Retirar del toolchain los paquetes obsoletos reportados durante la instalación sin alterar la API pública utilizada por ContaGest y mantener el `package-lock.json` sincronizado con los manifiestos.

Paquetes objetivo:

- `rimraf@2.7.1`
- `lodash.isequal@4.5.0`
- `inflight@1.0.6`
- `glob@7.2.3`
- `fstream@1.0.12`
- `uuid@8.3.2`

## Causa raíz y reapertura

La investigación original identificó que la cadena obsoleta partía de `exceljs@4.4.0`. El backend pasó a conservar el specifier público `exceljs` mediante el alias npm:

```json
"exceljs": "npm:@excel.js/exceljs@0.15.0"
```

Después del merge de #127, el manifiesto permaneció correcto, pero el `package-lock.json` de `main` volvió a declarar `backend.dependencies.exceljs` como `4.4.0`. Esa deriva manifiesto/lock hace que la corrección no sea reproducible con `npm ci` y justifica la reapertura de #26.

La resolución de seguimiento añade un gate específico que regenera el lock con npm, exige que el archivo versionado sea idéntico al resultado reproducible y falla si reaparece cualquiera de las seis versiones objetivo.

## Invariantes verificadas por el gate

`tests/toolchain_dependency_cleanup_issue_26.test.mjs` comprueba que:

1. `backend/package.json` usa el alias mantenido;
2. `package-lock.json` declara el mismo alias para el workspace backend;
3. el paquete instalado bajo `node_modules/exceljs` corresponde a la versión `0.15.0` del fork;
4. ninguna entrada del lock contiene las versiones transitorias objetivo;
5. `@types/bcryptjs` no reaparece.

`.github/workflows/toolchain-deps-v26.yml` añade evidencia ejecutable:

- regeneración determinista del lock con Node 22;
- artifact del lock regenerado ligado al SHA candidato;
- comparación `git diff --exit-code package-lock.json`;
- `npm ci` limpio;
- `npm ls` de los seis paquetes objetivo;
- regresión Node del lock;
- smoke XLSX de escritura + lectura con ExcelJS.

## Criterio de PASS

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
node --test tests/toolchain_dependency_cleanup_issue_26.test.mjs
git diff --exit-code -- package-lock.json
npm ci --ignore-scripts --no-audit --no-fund
npm ls rimraf lodash.isequal inflight glob fstream uuid --all
```

La salida de `npm ls` puede ser vacía; lo obligatorio es que no aparezcan las versiones objetivo y que el test contractual permanezca verde.

## QA funcional

Además del gate de dependencias, debe mantenerse el smoke de compatibilidad de ExcelJS: crear un workbook, serializarlo a XLSX, volver a cargarlo y confirmar el contenido. Esto reduce el riesgo de que la sustitución mantenga el nombre del paquete pero rompa la superficie utilizada por ContaGest.

## Seguridad / supply chain

Este ticket no autoriza upgrades indiscriminados de Prisma, PostgreSQL ni otras cadenas no relacionadas. Cualquier vulnerabilidad residual fuera de los seis paquetes objetivo debe conservar su propia evidencia y ticket para evitar mezclar una limpieza acotada con cambios de persistencia de mayor riesgo.

## Rollback

Si el fork mantenido demuestra incompatibilidad funcional:

1. revertir el alias de `backend/package.json`;
2. regenerar `package-lock.json` con npm, nunca editarlo parcialmente a mano;
3. ejecutar el gate completo y el smoke XLSX;
4. reabrir #26 con la cadena transitoria resultante documentada.

El rollback puede restaurar la deuda original, por lo que no debe presentarse como cierre del issue.
