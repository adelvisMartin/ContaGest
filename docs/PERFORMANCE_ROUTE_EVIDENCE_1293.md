# #1293 · Baseline de rendimiento de rutas — campaña de laboratorio

## Alcance del incremento

Instrumenta una única navegación sintética en Chromium, a 1440×900, para las 60 rutas que coinciden entre `qa/support/module-visual-catalog.mjs` y `frontend/src/data/pageRegistry.js`. No modifica la aplicación ni autoriza presupuestos de rendimiento sin línea base real.

Reutiliza el helper de espera determinista y las respuestas sintéticas de QA, sin solicitar credenciales de usuarios ni datos reales. La campaña mide tiempo desde navegación hasta render estable (incluye coste de Playwright), LCP observada cuando el navegador la expone, CLS observada, recursos transferidos y número de peticiones API **simuladas**.

**Importante:** estos valores no son Web Vitals de usuarios reales. Una sola ejecución no establece p75; INP requiere interacción instrumentalizada y permanece `null`. Los percentiles de API/BD real permanecen `null`. Los controles de #157 y #564 siguen siendo authorities para sus respectivos workloads; no se sustituye ni duplica el motor PostgreSQL #644.

## Ejecución reproducible

1. Checkout del SHA exacto a medir y `npm ci` (lockfile npm del repositorio).
2. Define `CANDIDATE_SHA` con el SHA actual de HEAD y `CG_PERF1293_RUN_ID` con una etiqueta única, segura y específica de esa campaña. GitHub Actions usa `GITHUB_RUN_ID` automáticamente.
3. `npm run test:perf:routes:1293` para probar el validador.
4. Instala Chromium con Playwright y ejecuta `npm run perf:routes:1293`.
5. Examina `artifacts/performance/v1293/<sha>/<run-id>/desktop-1440/summary.json` y las 60 observaciones individuales.

La ejecución completa requiere las dependencias y el servidor frontend definidos en `playwright.config.mjs`. El script de resumen falla con `--strict` si falta alguna ruta; todo dato debe coincidir en SHA, run ID, navegador, perfil y provenance. Un fallo browser no debe promocionarse a PASS por un reporte de otra ejecución. Los artefactos del workflow corresponden a su SHA/identificador exactos.

## Fuera de alcance y siguiente campaña

- **NO VERIFICADO:** LCP/INP/CLS p75 de campo, navegación de usuarios por rol, red real, latencia de API p50/p95, queries/EXPLAIN PostgreSQL 17, móviles y Control Hípico.
- **NO IMPLEMENTADO:** optimizaciones, índices, caché, cambios de RBAC, cambios de política de SOURCE WhatsApp o umbrales de rendimiento en CI.
- Medir múltiples ejecuciones comparables sobre hardware/fixtures/red documentados antes de ratificar budgets. Después comparar mismo escenario/SHA antes y después de un cambio y ejecutar regresiones funcionales, seguridad A/B, accesibilidad y offline.

Estado esperado del primer incremento: `LAB_BASELINE_ONLY`, nunca PASS de producción.
