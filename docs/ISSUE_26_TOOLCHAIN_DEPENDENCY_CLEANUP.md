# Issue #26 · Limpieza de dependencias transitorias obsoletas

## Objetivo

Retirar del toolchain los paquetes obsoletos reportados durante la instalación sin alterar la API pública utilizada por ContaGest.

Paquetes objetivo:

- `rimraf@2.7.1`
- `lodash.isequal@4.5.0`
- `inflight@1.0.6`
- `glob@7.2.3`
- `fstream@1.0.12`
- `uuid@8.3.2`

## Causa raíz identificada

La cadena obsoleta parte de `exceljs@4.4.0`. Para mantener el specifier público usado por el backend (`exceljs`) y reducir el riesgo de refactor funcional, el manifiesto pasa a un alias npm dirigido al fork mantenido:

```json
"exceljs": "npm:@excel.js/exceljs@0.15.0"
```

El reemplazo conserva las superficies de `Workbook` y XLSX que deben validarse en el QA funcional antes del merge.

## Evidencia de resolución de dependencias

Se regeneró un `package-lock.json` con npm en Node 22 usando el manifiesto actualizado, sin editar el lock manualmente.

Resultado observado durante esa regeneración:

- 472 paquetes auditados por npm;
- lock generado: 214520 bytes;
- SHA-256 del lock generado: `43f2e4a74b109dbc348db589f113f91cfffc404bc8e49d3a8b9060486e0b42d2`;
- los seis paquetes obsoletos objetivo dejan de formar parte del árbol generado.

> Importante: esta evidencia prueba la resolución del árbol generada por npm, pero no sustituye el QA completo de la aplicación.

## QA pendiente antes del merge

El PR se deja deliberadamente con QA pendiente a petición del responsable del repositorio. No debe interpretarse como PASS de producción.

Ejecutar como mínimo:

```bash
npm install --package-lock-only --ignore-scripts
npm ci
npm ls rimraf lodash.isequal inflight glob fstream uuid
node --test tests/toolchain_dependency_cleanup_issue_26.test.mjs
npm --workspace backend run typecheck
npm run build
```

Además, hacer smoke funcional de cualquier flujo que genere o lea XLSX/Excel para confirmar compatibilidad observable con el fork mantenido.

### Criterio esperado para las dependencias objetivo

`npm ls rimraf lodash.isequal inflight glob fstream uuid` no debe mostrar las versiones obsoletas indicadas por #26.

## Seguridad / npm audit

Durante la regeneración aislada del lock, npm informó actualmente 3 vulnerabilidades HIGH asociadas a la cadena de Prisma/deepmerge-ts. Ese hallazgo no nace del cambio de ExcelJS y debe tratarse de forma separada para evitar mezclar un upgrade de persistencia con este mantenimiento.

Por lo tanto, este PR **no declara `npm audit` como PASS**.

## Riesgo

**Medio hasta completar QA.** El nombre importado por la aplicación continúa siendo `exceljs`, pero cambia la implementación instalada detrás del alias npm. El riesgo principal es una incompatibilidad no detectada en generación/lectura de archivos XLSX.

## Rollback

Si el QA detecta una regresión funcional:

1. revertir el cambio de `backend/package.json` a `exceljs@4.4.0`;
2. regenerar `package-lock.json` con npm;
3. ejecutar nuevamente instalación, typecheck y smoke XLSX.

El rollback restaura el comportamiento anterior, pero también restaura la deuda de dependencias obsoletas que motivó #26.
