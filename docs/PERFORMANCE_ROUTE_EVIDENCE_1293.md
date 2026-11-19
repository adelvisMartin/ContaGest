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

## Incremento 2026-11-19 · Perfil de captura y comparación repetible de laboratorio

La campaña de cada ruta incluye `labEnvironment` (Node, plataforma, arquitectura, modelo y
número lógico de CPU, versión Chromium, viewport, tema y reduced-motion). La red se marca
`UNTHROTTLED_NOT_VERIFIED`: **no existe garantía de que dos ejecuciones hayan tenido la misma
latencia, presión de CPU o caché**. El comparador rechaza diferencias declaradas en el perfil,
pero el operador aún debe registrar manualmente condiciones de red, caché y carga del runner.

Cada ruta informa `jsTransferBytes` y `cssTransferBytes` según PerformanceResourceTiming
sobre recursos observados al abrir la vista. Son **bytes transferidos por navegación** (pueden
ser cero por caché), no el peso completo de bundles en disco ni JavaScript ejecutado.

### Repetir antes de comparar

Se requieren entre **5 y 30 campañas completas**, cada una con las 60 rutas, ejecutadas
sobre **el mismo HEAD** y hardware/versiones/perfil declarados equivalentes. Ejemplo
en bash, desde un checkout aislado con `npm ci` y Chromium instalado:

```bash
export CANDIDATE_SHA="$(git rev-parse HEAD)"
for n in 1 2 3 4 5; do
  CG_PERF1293_RUN_ID="lab-$n" npm run perf:routes:1293
done
CG_PERF1293_COMPARE_RUN_IDS=lab-1,lab-2,lab-3,lab-4,lab-5 npm run perf:routes:1293:compare
```

Salida: `artifacts/performance/v1293/<sha>/lab-campaign-comparison.json`. El
comparador calcula p50/p75/p95 por rango más cercano, media, varianza poblacional
y desviación estándar, **solo para métricas de laboratorio con todas las muestras
válidas**; una observación faltante deja percentiles en `null`. Rechaza SHA, run ID,
orden/catálogo de rutas, entorno, fuente, métricas inválidas o intentos de presentar
INP, API real, PostgreSQL o Core Web Vitals de campo como medidos.

**Estado de este incremento:** código de instrumentación/comparación, **no resultados de
campañas**. Los artefactos del PR y los del workflow deben revisarse en el SHA final;
sin cinco campañas comparables, el tablero de percentiles queda `NOT_EXECUTED`.
Quedan pendientes roles, usuarios reales, móvil 360/390/430, Hípico, LCP/INP/CLS
p75 de campo, API p95, EXPLAIN PostgreSQL 17 y antes/después de optimizaciones.
No modificar presupuestos ni optimizar servicios financieros por estas medidas.

## Auditoría QA incremental · 2026-11-19 · precisión de percentiles y Hípico

Revisión con pruebas RED → GREEN sobre el comparador: inicialmente se reprodujeron
cuatro fallos (contadores fraccionarios, varianza infinita/JSON nulo, deriva falsa
por orden de campos JSON y metadatos del runner no permitidos). El comparador
ahora exige enteros seguros para los cinco contadores/tamaños, estadísticas
finitas y fingerprint canónico con lista explícita de campos para evitar
introducción accidental de datos del entorno no revisados.

**Evidencia limitada:** las ocho pruebas unitarias de este comparador pasaron
aisladamente en Node 22.16.0 sobre blobs exactos del PR. No reemplazan el gate
Playwright, tests antiguos, `npm ci`, build, PostgreSQL ni CI exact-SHA.

### Control Hípico es un producto separado

La autoridad `qa/support/hipico-visual-catalog-v105.mjs` define nueve vistas
(`dashboard`, `race`, `whatsapp`, `advanced`, `participants`, `history`,
`reports`, `polla`, `settings`) y siete perfiles de viewport. Su suite
`qa/hipico-visual-functional-v105.spec.mjs` aporta fixtures local-only,
normal/empty/offline, arranque/loading/error y accesibilidad de la PWA.
**No deducir métricas de rendimiento de capturas de pantalla ni de pruebas de layout.**

Los recorridos prioritarios a **medir en una campaña Hípico futura** son:
captura y consulta de carrera activa, adelantadas, cambio de grupo,
participantes, histórico, cierres/saldos y recuperación offline. Probar
cada recorrido con fixture sintético aislado, ausencia de mensajes SOURCE
automatizados, prevención de doble operación y permisos del grupo; capturar
tiempos de primer dato útil y de interacción, payloads y consultas reales
sobre PostgreSQL efímero antes de proponer optimizaciones.

La revisión competitiva se limita a patrones públicos de tareas y a
documentación técnica; **no** implica scraping de usuarios, apuestas privadas,
credenciales, datos propietarios ni APIs no autorizadas. No cambiar reglas
de remate, liquidación, comisiones, FX, saldos o apuestas a partir de diseños
de terceros. Debe mantenerse separado el producto Hípico del ERP 60 rutas.

**Estado QA Hípico en este PR: NOT_EXECUTED para rendimiento.** No hay
benchmark before/after ni perfil API/DB Hípico que permita afirmar mejoras.
