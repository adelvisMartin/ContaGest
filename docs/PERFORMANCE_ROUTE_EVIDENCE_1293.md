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

### Aislamiento de peticiones del navegador (endurecimiento QA)

El test Chromium de las 60 rutas comprueba el `baseURL` que Playwright
realmente utiliza y solo permite peticiones HTTP(S) al mismo **origen
loopback**, incluido el puerto. Todos los `/api/**` se satisfacen con
fixtures sintéticos; los demás recursos de ese origen proceden del servidor
de pruebas. Las peticiones **directas** a terceros, otras interfaces/puertos,
URL con credenciales o protocolos ajenos se bloquean en el interceptor. Las
**redirecciones HTTP** pueden escapar al interceptor `page.route()` de Playwright:
se registran también eventos `request` y cabeceras `Location` para invalidar
cualquier captura que detecte destinos externos. Esta comprobación a posteriori
**no es una barrera de salida de red**; un redirect podría iniciar la solicitud
antes de detectarse. Usar red/runner aislado cuando se necesite contención fuerte.
Se deshabilitan los Service Workers **solo en este test de medición**
para que no eludan la interceptación. Los WebSockets ahora usan una validación
separada (`ws` ↔ `http`, `wss` ↔ `https`) de origen y puerto, y se
interceptan con `page.routeWebSocket()`: los locales conservan comunicación,
los externos se cierran y hacen fallar la campaña. Su ejecución real aún está
**NOT_EXECUTED**; esto no prueba operación offline ni detiene redirecciones
HTTP a nivel de firewall.

El helper `qa/support/performance-lab-isolation-v1293.mjs` incluye tests
positivos/negativos de mismo origen, puertos distintos, dominios homógrafos
simples, protocolos no HTTP y URL con usuario/contraseña. Esta protección
no sustituye el gate de navegador: solo se han ejecutado los tests unitarios
en el entorno aislado. Si la app requiere un recurso externo para renderizar,
la campaña **debe fallar y diagnosticarse**; no se deben añadir allowlists
de terceros arbitrarias para maquillar los resultados.

## Tercera revisión QA: identidad canónica, esquema cerrado y redirecciones

**Causa raíz reproducida:** el agregador de una ejecución comparaba el
JSON del runner por orden de propiedades mientras el comparador multi-run ya
usaba fingerprint canónico; también copiaba directamente todos los campos
`metrics` a `summary.json`, incluidos metadatos no revisados.

**Corrección:** `labEnvironmentFingerprint()` compartido entre ambas
herramientas; exactamente nueve campos de `metrics` permitidos, sin
`sessionToken`, `rawUrl` u otras propiedades inesperadas. Se conserva el
primer entorno validado en el informe, y las condiciones realmente distintas
siguen fallando.

**RED → GREEN:** cuatro regresiones nuevas reprodujeron tres defectos:
fingerprint nuevo inexistente (1), propiedades JSON equivalentes rechazadas y
métricas con campos extra aceptadas (2), y redirecciones sin validador (1).
Suite local aislada, Node 22.16.0: **21/21 tests PASS** tras corregir. Una
regresión reproducible aplica **1.000 permutaciones deterministas de los
campos del runner y 1.000 inyecciones de claves**; son casos sintéticos,
**no 1.000 iteraciones manuales, rutas reales, refactors o pruebas E2E**.
Se comprobó `git hash-object` de cada archivo JS ejecutado contra su blob
publicado en GitHub. La instalación completa, navegador real, API, PostgreSQL,
OS firewall, métricas field y ramas/rutas productivas siguen sin ejecutarse.

**Fuente externa examinada (documentación oficial):**
https://playwright.dev/docs/network y https://playwright.dev/docs/api/class-page .
`page.route()` no necesariamente reintercepta un salto de redirección;
el control actual detecta el intento y falla, pero no promete prevenir todos
los paquetes salientes. Limitar cualquier ejecución a fixtures sintéticos
aislados; no introducir credenciales de producción ni dependencias externas
para superar el gate.

**Estado:** `LOCAL_UNIT=PASS` para estos contratos, `LOCAL_BROWSER_E2E=NOT_EXECUTED`,
`LOCAL_POSTGRES=NOT_EXECUTED`, `REMOTE_CI=BLOCKED` mientras estén en cola
los checks del HEAD exacto. El epic #1293 continúa OPEN/PARTIAL, sin afirmar
que el producto se haya acelerado ni ratificar presupuestos de rendimiento.

### Cuarta revisión QA: transporte WebSocket de laboratorio

La documentación de Playwright admite `websocket` como `resourceType`
de una petición y ofrece `page.routeWebSocket()` para este transporte
(https://playwright.dev/docs/api/class-request ,
https://playwright.dev/docs/api/class-websocketroute ).
El interceptor HTTP no debe tratar `ws://127.0.0.1:8080` del servidor de
desarrollo como dominio externo ni permitir `wss://otro-dominio`.

Se añadió `isAllowedLabSocket()`, con regla explícita de esquema, host y
puerto; cierre de conexiones WebSocket externas mediante `routeWebSocket()`;
telemetría de `page.on('websocket')` y tratamiento de peticiones con
`resourceType=websocket`. La quinta regresión del aislamiento se reprodujo
primero como FAIL y después pasó. Resultado local actualizado en Node 22.16.0:
**22/22 tests PASS**, sintaxis y hashes de los seis archivos JS de validación
verificados. **Aún no hay ejecución de Playwright Chromium real**, por lo que
esta instrumentación de red sigue siendo hipótesis de integración pendiente.


### Quinta revisión QA: esquema compartido y 60 rutas sin deriva

**Antes de editar**, se verificó que el HEAD del PR parte de la misma base
`main@bb13003cb77efc1c4c37390a0c6d8414f6232aa9`, con el ticket
#1293 todavía abierto y Actions en cola. La copia parcial aislada contenía
los seis blobs JavaScript del PR; todos pasaron sintaxis y 22/22 unit tests
en Node v22.16.0 antes de los nuevos cambios. **No era un checkout completo
del repositorio**, por lo que no se ejecutó el router v3, Playwright ni build.

**Defecto confirmado (RED):** el comparador multirun aceptaba
`row.lab.sessionToken`, `row.lab.rawRequest` o una clave renombrada,
aunque el agregador original ya rechazaba claves no esperadas.
Una regresión negativa falló con `Missing expected exception`.
El comparador exige ahora conjunto exacto de claves y no admite
propiedades adicionales, campos faltantes ni arrays como métricas.

**Refactor mínimo:** `LAB_METRIC_KEYS` exportado una sola vez por
`performance-route-campaign-v1293.mjs` y reutilizado por el validador
`performance-route-evidence-v1293.mjs`. La dependencia ya existía
para el fingerprint, no se añadió paquete ni ciclo de importaciones.
Un test adicional comprueba que el esquema compartido es inmutable y
coincide con las observaciones.

**Resultado real:** `node --test tests/*.test.mjs` en el directorio aislado
`contagest-1293` → **24 PASS, 0 FAIL, 0 SKIP**; `node --check` de
los seis archivos JS → **PASS**. Los hashes `git hash-object` de todos
los archivos actualizados coinciden con los blobs publicados en la
rama del PR. El catálogo visual y `pageRegistry` consultados
directamente en GitHub contienen **60 rutas únicas cada uno**,
coinciden en sus identificadores y orden; esto no sustituye la ejecución
de navegación/UX de cada ruta.

**Resultado no autorizado a inferir:** que la UI es más rápida, que
el backend/PG17 cumplen p95 o que Control Hípico es funcional en
offline/móvil. `LOCAL_BROWSER_E2E=NOT_EXECUTED`,
`LOCAL_POSTGRES=NOT_EXECUTED`, `LOCAL_BUILD=NOT_EXECUTED`,
`REMOTE_CI=BLOCKED` mientras existan checks en cola.


## Sexta revisión QA: disparadores reales del laboratorio · 2026-11-19

**Defecto CI reproducido (RED):** el workflow
`.github/workflows/performance-route-v1293.yml` solo reaccionaba a cambios
en la instrumentación y los tests. Si cambiaban las autoridades del
inventario (`module-visual-catalog.mjs`, `pageRegistry.js`), los fixtures
(`erp-system-fixtures-v155.mjs`), el readiness helper o
`playwright.config.mjs`, un PR podía modificar los insumos del laboratorio
sin activar su gate especializado.

**Corrección mínima:** incluir esas cinco rutas exactas en
`on.pull_request.paths`. Se mantiene `workflow_dispatch` y la captura de
HEAD exacto, Node 22, Chromium y artefactos; no se añaden sleeps, skips,
retries ni se rebajan timeouts. El gate **no se extiende automáticamente a
cualquier página, estilo, API o cambio de Control Hípico**: esos flujos
requieren sus matrices y un plan de rendimiento específico. Esta ampliación
intencionalmente acotada evita crear un gate universal redundante.

**Nueva regresión:** `tests/performance_route_workflow_v1293.test.mjs`
verifica los cinco disparadores y que persistan checkout por SHA y el
comando de Chromium. Antes del cambio: **1 PASS / 1 FAIL**; después:
**2 PASS / 0 FAIL** en Node 22.16.0. `node --check` del test PASS;
PyYAML 6.0.3 pudo analizar el workflow. Los hashes Git de **ambos archivos
probados** coinciden con los blobs publicados en la rama. El script
`npm run test:perf:routes:1293` incluye la regresión.

**Limitación de la evidencia:** esta verificación local usa únicamente el
workflow y el archivo nuevo de test. No demuestra `npm ci`, el conjunto
completo de unit tests del HEAD, lint, typecheck, build, navegador Chromium,
60 recorridos, cinco campañas, field Web Vitals, latencias reales API o
PostgreSQL 17. Esos gates conservan `NOT_EXECUTED` local hasta ejecutarse;
CI solo será PASS al completarse para el SHA final.


## Séptima revisión · Cobertura de cambios de renderizado

**Defecto de cobertura confirmado:** el gate de 60 rutas observaba los
scripts, el catálogo y `pageRegistry.js`, pero no los archivos de páginas,
componentes y estilos que pueden cambiar el tiempo de renderizado sin modificar
el catálogo. Por tanto, algunos PR de frontend podían quedar sin ejecución
del workflow especializado.

**RED / GREEN reproducibles:** se amplió
`tests/performance_route_workflow_v1293.test.mjs` para exigir seis patrones:
`frontend/src/pages/**`, `frontend/src/components/**`,
`frontend/src/styles/**`, `frontend/src/app.js`,
`frontend/index.html`, `frontend/vite.config.js`.
Con el workflow anterior, `node --test` dio **2 PASS / 1 FAIL**
(`Missing frontend performance owner: frontend/src/pages/**`).
Tras añadir los seis patrones al filtro `on.pull_request.paths`, dio
**3 PASS / 0 FAIL / 0 SKIP** en Node v22.16.0. `node --check` del test
y parse de YAML pasaron. Los dos hashes `git hash-object` coinciden con
los blobs del PR: test `cefcd929c89bfcbcfc77ab6b1a20ebf3aaf1c8eb`,
workflow `757eee9d3e81ab825d62a358b11f783750cc1aa4`.

**Consecuencia operativa:** se solicitará el gate en más PRs de frontend,
con un costo potencial en minutos de GitHub Actions. No se ha aumentado la
paralelización, desactivado navegadores ni relajado pruebas para ahorrar cuota.
El workflow ejecuta una campaña **sintética Chromium**: un disparador
correcto no certifica una ruta ni mide API/DB, INP de campo, dispositivos
físicos o flujos monetarios. Si Actions no arranca por límite de cuota,
el gate continúa **BLOCKED**, nunca PASS. Control Hípico conserva su matriz
independiente y ninguna regla de apuestas/remates se modificó.
