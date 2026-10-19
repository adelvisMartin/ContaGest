# Hípico #120 — Validación UTC y coherencia física de muestras soak

## Brecha y cambio

La autoridad de verificación `validSoakMetricEvidence` ya validaba el mínimo de 24 horas, el intervalo de muestras de 30 segundos, densidad del 90%-125%, contadores no negativos, duración y tasas derivadas. Sin embargo, `Date.parse` acepta fechas locales sin zona horaria y offsets, de manera que el resultado del mismo artifact puede depender de la zona del runner. También aceptaba mediciones de memoria de proceso de 0 MiB o `heapUsed > RSS`, aun con cálculos derivados internamente consistentes.

El runner de Hípico escribe `startedAt` y `completedAt` mediante `new Date().toISOString()` y observa memoria con `process.memoryUsage()`. Ahora el validador exige fechas ISO UTC canónicas `YYYY-MM-DDTHH:mm:ss.sssZ` sin conversiones ambiguas, comprueba que su conversión y normalización sean idénticas y exige que RSS/heap iniciales/finales sean positivos y que el V8 heapUsed no supere el RSS respectivo.

No se modifica el umbral de 24 horas, la tolerancia existente del reloj, la política de 30 segundos, el presupuesto de muestras, los thresholds, el backend, la base de datos, los transportes de WhatsApp ni los workflows.

## Prueba ejecutada y alcance

Se ejecutaron en Node.js v22.16.0:

```sh
node --test tests/hipico_soak_metric_physical_v120.test.mjs
node --check scripts/hipico-soak-metric-integrity-v120.mjs
```

Resultado: **9/9 PASS** en el aislamiento local (5 tests nuevos y 4 tests existentes de `hipico_soak_temporal_budget_v120.test.mjs`, reproducidos con los mismos casos y aserciones del archivo ya fusionado en main), source exactamente correspondiente al Git blob `358d03e9b3655e8ba624dcf48c072e690a6fb4c5`, test blob `e65a4f4568a7540c489519f2b55482b67c75824b`. La prueba de memoria modifica también las tasas derivadas, para demostrar que el rechazo procede de incoherencia física y no de un error aritmético. Mutación negativa retirando el guard de memoria: **1 test FAIL esperado**; código restaurado: **5/5 PASS**.

No se ha ejecutado un soak de 24–72 horas, instalación de QA en Windows/Android, sesiones reales, backend completo ni acciones remotas en esta ejecución. Este incremento valida metadatos de un reporte, **no prueba que las mediciones procedan de una jornada real**. Pruebas globales existentes de #120 y #839 deben correrse en un checkout completo y corroborar los archivos originales firmados/ligados a candidate SHA.

## Gate pendiente / rollback

El issue #120 debe permanecer **OPEN** y #839 **NO_GO** hasta evidencias reales de 24 horas como mínimo, reinicios, conectividad/recovery y cola, sin habilitar SOURCE automático por la política #1011. El rollback consiste en revertir este módulo/test/docs; no hay migraciones ni cambios persistentes. `QUEUED` de GitHub Actions no es `PASS`; no desactivar required checks.
