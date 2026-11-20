# #710 — Entrada de mediciones periodontales: ausencia no equivale a cero

Baseline `main@5cbd858803275f3033019a8977b38fb772333c71` (19 Nov 2026). Subalcance #747 trasladado a la épica #710.

## Defecto confirmado por código fuente
`health.schemas.ts` usaba `z.coerce.number()` en sondaje, margen gingival, movilidad y furcación. En JavaScript, `Number('')===0`, `Number(null)===0` y `Number(false)===0`. Un formulario con una medición omitida podía convertirse silenciosamente en **cero clínico**, especialmente peligroso al guardar un `CareEncounter` firmado. Esto no es una variación de UX cosmética.

## Corrección integrada
`dental-periodontal-value.ts` impide coerciones de null, boolean, array, vacío, notación exponencial y decimales fraccionarios, reteniendo enteros válidos (incluido el cero explícito y margen negativo). Los cuatro campos se validan por el mismo `z.preprocess(..., z.number().int().min(...).max(...))` reutilizando el schema existente. No se crean tablas ni otra autoridad periodontal.

La consulta histórica `health-dental-chart-history.routes.ts` conserva `CareEncounter` firmado como autoridad. Cuando el nuevo schema rechace un registro histórico ambiguo, la proyección existente debe informar `complete:false` y no publicar un estado `current` inventado. **No reescribir retroactivamente el dato almacenado ni inferir un cero**. El saneamiento clínico requiere enmienda autorizada del profesional.

## Criterios y evidencia requerida
- Omisión ('' / null / Boolean) rechazada, no tratada como cero; cero explícito válido.
- Entero y margen negativo válido; precisión, límites y seis sitios canónicos se conservan.
- Proyección histórica con registros no proyectables fail-closed.
- Tests positivos/negativos de helper y esquema en `tests/dental_chart_consistency_v747.test.mjs`.
- Validación **NOT_EXECUTED**: Node22/npm ci, typecheck, tests, API/PG17 aislado (tenant A/B), navegador móvil 360/390/430 y teclado/foco, CI exact-SHA. Las regresiones añadidas y la inspección source no equivalen a ejecución.
- **Riesgo**: los datos legacy vacíos anteriormente aceptados ya no proyectan estado actual. No hay migración ni modificación histórica; rollback por revert de esta rama, no por mutación SQL.

**Fuera de alcance**: sustituir historia clínica, generar diagnósticos, cambiar aceptación de consentimientos, billing o portal. El resto de #710 sigue OPEN hasta verificar la épica completa.

## Revisión independiente de test y comportamiento (2026-11-19)

Se detectó un fallo real en la suite histórica `tests/dental_chart_consistency_v747.test.mjs`: importaba `fs` pero usaba `readFileSync(...)` sin prefijo/import dentro de la prueba de accesibilidad periodontal. Esto produciría `ReferenceError: readFileSync is not defined` al ejecutar esa prueba, independientemente del cambio clínico. Se corrigió a `fs.readFileSync` sin eliminar ni relajar ninguna aserción. **No se ejecutó la suite completa** porque el checkout y sus dependencias no están disponibles en este entorno.

Referencia de contraste público, consultada el 19-11-2026: [ADA — Documentation/Patient Records](https://www.ada.org/resources/practice/practice-management/documentation-patient-records) y [ADA — D4346 clinical record](https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/publications/cdt/v6_adaguidetoreportingd4346_2023jan.pdf). Sirve para justificar preservar hechos clínicos efectivamente medidos, no para inventar diagnósticos ni certificar regulación local. La validación del producto debe ser revisada por profesional autorizado.
