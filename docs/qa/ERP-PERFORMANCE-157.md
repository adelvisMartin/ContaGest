# ERP Performance & Capacity #157

La política `products/erp/performance-policy-v157.json` define presupuestos **provisionales** hasta obtener mediciones reproducibles del candidate.

## Frontend

Se registran startup P95, cambio de ruta P95, save P95, import de 1.000 filas, render de tablas 100/1.000/10.000 y crecimiento de heap en sesión larga.

## Backend

Se registran p50/p95/p99, error rate y throughput. Los perfiles requeridos son cold, warm, navegación repetida, sesión larga y red limitada.

## Evidencia

`CANDIDATE_SHA=<sha> node scripts/erp-performance-gate-v157.mjs init`

crea `artifacts/qa/erp-performance-v157/<sha>/measurements.json`. Las mediciones deben provenir de ejecución real; el template queda NOT_EXECUTED. Luego:

`CANDIDATE_SHA=<sha> node scripts/erp-performance-gate-v157.mjs check`

Un valor medido que viola budget produce FAIL. Falta de perfiles/métricas produce NOT_EXECUTED. Cuando todos los datos existen y cumplen targets aún se etiqueta `MEASURED_PROVISIONAL` hasta formalizar baselines con suficiente muestra.

## Regresión

Toda comparación debe conservar candidate SHA, entorno, dispositivo/red y perfiles. Una mejora en desktop no puede ocultar una regresión mobile o de sesión larga.
