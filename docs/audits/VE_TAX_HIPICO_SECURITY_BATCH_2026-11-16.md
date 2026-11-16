# ContaGest / Control Hípico — lote #778–#783 / #1011 / #1291 / #892 / #1018 / #1292
Fecha de inspección: 2026-11-16 · Baseline público de `main`: `e7706f3dac3ae4c677fcdff05a662765fa6bdcc6`.

> **Estado de este PR: PARTIAL / DRAFT.** Este documento es un registro de alcance y riesgos, no un certificado fiscal, una autorización de WhatsApp ni evidencia de pruebas que no corrieron. No cerrar los diez issues ni habilitar opciones de producción a partir de esta rama. Una sola rama/PR contiene incrementos acotados de #1292 y #1291/#892; no se falsea el DoD de ningún issue.

## Autoridad, límites y claims

Se leyeron `AGENTS.md`, `docs/PROJECT_START_HERE.md`, `.agents/TICKET_EXECUTION_POLICY.md`, `docs/hipico/AGENTS.md` y las skills locales de orquestación, verificación segura, evidencia de release, integridad contable y LAB. Los agentes y skills son perfiles de trabajo, no ejecuciones reales independientes. El router `node scripts/agent-ticket-router.mjs gates --base main --type audit` y su matriz de ejecución requieren checkout completo, no disponible en el entorno de esta edición.

Hay dos PR **DRAFT** ajenos a este incremento sobre el mismo baseline: [#1287](https://github.com/adelvisMartin/ContaGest/pull/1287) (fiscal: #751/#774/#785) y [#1295](https://github.com/adelvisMartin/ContaGest/pull/1295) (política/backlog, documentación). No cambiar sus ramas ni repetir su trabajo. Sin sincronización o prueba sobre un nuevo `main`, no fusionar este PR.

### Contratos observados en código fuente de main

| Ticket | Comportamiento comprobado por inspección | Brecha que permanece |
| --- | --- | --- |
| [#778](https://github.com/adelvisMartin/ContaGest/issues/778) IGTF | `ve-igtf-event-preview.ts` usa selector moneda/medio/evento/condición con regla revisada; no autoriza efectos contables. | Fuente legal vigente, snapshot persistido, reversos, idempotencia, conciliación GL y tenant PostgreSQL17. |
| [#780](https://github.com/adelvisMartin/ContaGest/issues/780) Municipal | `ve-municipal-event-preview.ts` usa municipio/actividad, vigencia y hash de evidencia mensual no contable. | Catálogo oficial versionado, UI restringida, comprobantes, retenciones, posting y cierre. |
| [#781](https://github.com/adelvisMartin/ContaGest/issues/781) Parafiscales | `ve-parafiscal-breakdown-preview.ts` separa aportes patronales/deducciones en preview; FAOV/IVSS/INCES sintéticos. | Bases/topes y vigencias verificadas, integración a nómina persistida, movimientos y conciliación. |
| [#782](https://github.com/adelvisMartin/ContaGest/issues/782) Libros | `fiscal-book-readiness.ts` devuelve `BLOCKED_NOT_CERTIFIED`, nunca pretende ser libro fiscal. | FK/provenance invoice→snapshot, notas/anulaciones, cierres inmutables, export y conciliación con subledger. |
| [#783](https://github.com/adelvisMartin/ContaGest/issues/783) Compliance | Readiness y política de transiciones; evidencia de filing externo no representa presentación oficial. | Obligaciones/adjuntos con estado auditado persistido, banking, calendario, RBAC, PG17. |
| [#1011](https://github.com/adelvisMartin/ContaGest/issues/1011) Messenger | `source-read-policy-gate.mjs` siempre rechaza lectura automática; autoenvío SOURCE es NO-GO. | Autorización oficial no existe: permanece cerrado el gate; sólo LAB sintético/sugerencia humana. |
| [#1291](https://github.com/adelvisMartin/ContaGest/issues/1291) LAB AppSec | Consulta LAB conserva canal de lectura y contratos de respuesta restringidos; esta rama rechaza controles Unicode invisibles en preguntas. | Corpus adversarial completo, reproducción offline, aislamiento contextos y prueba de todos los arranques/errores. |
| [#892](https://github.com/adelvisMartin/ContaGest/issues/892) LAB canónico | `lab-canonical-query.mjs` llama endpoint existente con identidad y propósito de sólo lectura, rechaza SOURCE y autoridad financiera; esta rama corta texto Unicode sospechoso antes del fetch. | E2E real LAB→API→estado→response→outbox/receipt, PG17, reboot/retry, Windows LAB físico y soak. |
| [#1018](https://github.com/adelvisMartin/ContaGest/issues/1018) Shares | Política default-off y previos arreglos #1000/#1025/#1032/#1038. | RLS PostgreSQL17 de verdad, proxy/CDN token redaction, ledger vs PWA, consentimiento; NO activar shares. |
| [#1292](https://github.com/adelvisMartin/ContaGest/issues/1292) PWA | Ambos service workers evitaban caché de rutas sensibles, pero clasificaban por path sin considerar nombres de parámetros de credenciales en URL. | **Incremento de este PR**: excluir consultas privadas del fetch/caché offline. Faltan revocación real, cross-user IndexedDB/Cache Storage, Android físico y E2E. |

## Cambio implementado — reducción de superficie de caché (#1292)

1. `frontend/public/sw.js`: `isSensitiveRequest()` evalúa nombres de parámetros privados de URL antes de controlar la navegación o la caché pública.
2. `frontend/public/hipico-control/sw.js`: `isSensitive()` aplica el mismo criterio para excluir el fallback a shell offline. No se agrega caché sensible.
3. `tests/pwa_private_query_guard_v1292.test.mjs`: Node `vm` evalúa ambos **service workers reales** con transporte/cachés sintéticos. Casos positivos: `t`, `token`, `access_token` (incluido nombre URL-encoded), `refresh_token`, `id_token`, `code`, `api_key`, `signature`; casos negativos: filtros públicos, y navegación offline sin parámetro privado. Comprueba que la URL privada no lee/escribe shell.
4. `.github/workflows/pwa-offline-v563.yml` y `.github/workflows/hipico-build-runtime.yml`: ejecutan el nuevo contrato con Node 22 sobre el SHA del PR, sin skips, sin nuevos paquetes, sin desactivar jobs.

**Flujo de la protección:** Request URL → service worker → comprobación de parámetros de credenciales → ruta sensible: intervención de SW denegada o `fetch(no-store)` sin fallback → respuesta de red → ninguna escritura/lectura de caché persistente para esa solicitud. Una navegación pública conserva el shell offline.

**Alcance deliberadamente limitado:** la comprobación de nombres no elimina tokens del historial, analytics, CDN, proxies ni de la respuesta HTML, no soluciona fugas desde código ajeno al service worker y no es un sustituto de autenticación/RLS. El control raíz deja la petición fuera del SW; el control Hípico la envía a red con `no-store`. Se requieren comprobaciones E2E de URLs y navegación en navegador para verificarlo.

## Cambio implementado — entrada adversarial LAB (#1291 y #892)

5. `tools/hipico-whatsapp-web-bridge/src/lab-canonical-query.mjs`: filtro conservador de controles Unicode invisibles de separación/direccionalidad (por ejemplo U+200B, U+202E y U+2060) antes de clasificar la consulta o llamar el endpoint. Se preservan emojis legítimos con U+200D; se mantienen intactos el modo read-only, propósito, token, respuesta y NO-GO de SOURCE.
6. `tools/hipico-whatsapp-web-bridge/tests/lab-obfuscated-query-v1291.test.mjs`: prueba que una consulta visualmente inocua con instrucción monetaria ofuscada no llega a la red y que un emoji con joiner se procesa normalmente.
7. `.github/workflows/hipico-build-runtime.yml`: añade gate focal Node 22 para la regresión adversarial. El `npm test` propio del Bridge ya incluye `tests/*.test.mjs`.

**Flujo LAB:** texto sintético → rechazo de formato invisible sospechoso (fail-closed) → clasificación segura de intención → envelope de lectura → backend canónico (sin authority de escritura o dinero) → orientación / respuesta controlada. Este cambio **no** supone protección integral de prompt injection, spoofing Unicode, errores de clasificación, ni acredita entrega real WhatsApp.

## Evidencia requerida y estado

Estas etiquetas son hechos de esta ejecución; no son estados heredables entre commits.

| Dimensión | Estado | Evidencia necesaria para PASS |
| --- | --- | --- |
| SOURCE_REVIEW | PASS (inspección delimitada) | GitHub tree/archivos/issue y baseline SHA comparados; no equivale a QA. |
| LOCAL_STATIC / ROUTER | BLOCKED | Checkout completo para ejecutar router y diff/secret scan del SHA candidato. |
| LOCAL_UNIT / CONTRACTS | NOT_EXECUTED | `node --test tests/pwa_private_query_guard_v1292.test.mjs tests/pwa_offline_v563_contract.test.mjs tests/hipico_offline_recovery_routing_297.test.mjs tools/hipico-whatsapp-web-bridge/tests/lab-obfuscated-query-v1291.test.mjs`. |
| LOCAL_INTEGRATION | NOT_EXECUTED | `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`; ejecutar sobre SHA candidato. |
| LOCAL_POSTGRES | BLOCKED | PostgreSQL17 efímero propio, migraciones from-zero/upgrade, fixtures tenant A/B, prueba RLS/ledger; no BD compartida. |
| LOCAL_BROWSER_E2E | NOT_EXECUTED | Chromium PWA offline/private-navigation y flujos Hípico, accesibilidad, Firefox/WebKit donde aplique. |
| REMOTE_CI | NOT_EXECUTED | Inspeccionar GitHub Actions para el HEAD real del PR; un run queued/cancelled no es PASS. |
| REMOTE_DEPLOY | NOT_EXECUTED | Staging, identidad de artefacto, performance y rollback. |
| PHYSICAL_EXTERNAL | BLOCKED | Android real, Windows LAB/reconexión y aprobación de distribución de enlaces; SOURCE sin conectar. |

La política fiscal **prohíbe** tasas, bases, vencimientos, porcentajes, alícuotas, certificados o integraciones oficiales inventadas. Las mejoras superficiales no habilitan impuestos en producción. La base de código utiliza `npm ci` y `package-lock.json` (no modificar el gestor de paquetes para lograr CI verde).

## Riesgos, reversibilidad y mejoras futuras

**Riesgo funcional:** excluir consultas `code`, `t`, `token`, etc. del fallback offline puede reducir usabilidad de enlaces con esa consulta cuando no hay red; es un fallo cerrado previsto. Las rutas públicas sin credenciales deben seguir funcionando offline. Validarlo en Chromium/Android antes de unir a main.

**Riesgo de privacidad prioritario (#1292):** en `store-v2.js` la sesión cloud se puede limpiar mientras el workspace/snapshots históricos siguen en IndexedDB; se necesita modelar la separación entre datos locales voluntarios, owner anterior, revocación en servidor y recuperación sin borrar información legítima. No hacer una eliminación masiva sin backup/modelo de identidad y pruebas.

**Hoja de ruta por impacto/riesgo:** (P0) comprobación real de RLS, autorización/revocación y caché multiusuario con pruebas negativas; (P0) persistencia fiscal legal revisada, snapshots y libro/ledger balanceado con idempotencia; (P1) verificación adversarial reproducible del LAB con identidad/dedupe/outbox; (P1) percepción de velocidad mediante mediciones de payload, queries, paginación, SW cache/version y UX de obsolescencia; (P2) dashboard de evidencia y diagnósticos por período con filtros legibles, trazas no sensibles y accesibilidad mobile/desktop. No usar LLM para generar hechos tributarios, resultados de carreras ni órdenes financieras.

**Rollback de esta rama:** revertir los commits de guard de URL, regresión y enganche a CI; no hay migraciones ni cambios de datos. Antes de revertir una corrección de seguridad, reemplazarla por control equivalente o bloquear el flujo sensible. Mantener los flags `SOURCE` y report-shares en OFF.

**Decisión de release:** `PARTIAL` / `NO_MERGE` / `NO_PRODUCTION_ACTIVATION`; mantener abiertos los diez issues hasta verificar sus respectivos criterios. Reconciliar PR #1287/#1295 antes de cualquier merge.

## Iteración de hardening y refactorización del PR #1296 (2026-11-16)

**Qué se revisó:** HEAD vivo, diff del PR, dos SW, contratos de caché/offline, consultas canónicas de LAB, clasificación de intención, tests existentes y logs de Actions del candidato `0a22fbb8e65210b4d7ea375843277e111c2aa0e2`. Esta revisión **no** convierte el resto del backlog en implementado.

**Correcciones adicionales #1292:**
- Se interpreta el pathname con `decodeURIComponent` antes de decidir si una navegación tiene autoridad para usar el caché; los escapes malformados hacen fail-closed.
- El SW principal verifica la lista de recursos públicos **antes** de cachear solicitudes con destino `script` o `style`; una URL privada que aparentemente devuelve JS no puede crear un nuevo activo offline.
- El matcher de parámetros privados se compila una sola vez y recorre `URLSearchParams.keys()` sin materializar un arreglo en cada request. Esta reducción de asignaciones es una mejora estática; **no se afirma un benchmark real**.
- Tests del SW ejecutan URLs con path codificado, escapes inválidos, recursos script no autorizados, consultas privadas y navegación pública recuperable sin red. La allowlist de assets públicos se conserva; HTML/sesiones no se consideran caché privado autorizado.

**Correcciones adicionales #1291/#892:**
- El detector de texto adversarial contempla Unicode bidi, soft hyphen, combining grapheme joiner y ZWJ incrustado entre letras/números. No rechaza el ZWJ de emojis legítimos.
- Un helper `unsafeLabText` centraliza la comprobación y es usado tanto por la selección de propósito como por el envelope de red.
- La función de red `queryCanonicalLab` comprueba `MONEY` de nuevo aun cuando un caller directo omita `labReadOnlyQueryPurpose`; ni un bypass interno debe enviar una consulta con intención monetaria como lectura inocua.
- La regresión LAB comprueba que no se invoque `fetchImpl` en ninguno de los casos adversariales. No equivale a autorización de Messenger ni seguridad de NLP completa.

**CI exact-SHA histórico (candidato anterior, nunca trasladar PASS al nuevo HEAD):**
- Run [43903102133](https://github.com/adelvisMartin/ContaGest/actions/runs/43903102133) / job 133424678361: `Verify private URL/offline cache boundary` y `Verify synthetic LAB obfuscated query rejection` = **PASS**. `Build exact production frontend` = **FAIL** durante `preqa:source`: `tests/reproducible_install_contract.test.mjs:27`, expected `typeof deploymentEnabled === 'object'`, received `boolean`. Evidencia fuente: `vercel.json` raíz de main tiene `git.deploymentEnabled = false`, mientras `frontend/vercel.json` define una allowlist. Es divergencia PREEXISTENTE en baseline, no producida por el parche; no cambiar despliegues automáticos ni relajar el contrato sólo para dar verde.
- Run [43903102231](https://github.com/adelvisMartin/ContaGest/actions/runs/43903102231) / job 133424675429: 11 pruebas de contrato Hípico = **PASS**, navegador = **BLOCKED**, `HIPICO_CANDIDATE_WORKTREE_DIRTY`. El log no contiene aún la ruta modificada. Se añade diagnóstico `git status --short --untracked-files=all` **sólo cuando falle el job**; no relaja `inspectExactCandidate`. Hasta obtener las rutas, la causa del dirty tree se clasifica **NOT VERIFIED**, no se inventa.
- GitHub Actions del nuevo HEAD deben inspeccionarse por separado. Otros jobs `queued/pending/skipped` no cuentan como PASS.

**QA sugerida en checkout exacto:**
```sh
git rev-parse HEAD
git status --porcelain=v1
npm ci --no-audit --no-fund
node --test tests/pwa_private_query_guard_v1292.test.mjs tests/pwa_offline_v563_contract.test.mjs tests/hipico_offline_recovery_routing_297.test.mjs
node --test tools/hipico-whatsapp-web-bridge/tests/lab-obfuscated-query-v1291.test.mjs tools/hipico-whatsapp-web-bridge/tests/lab-canonical-query.test.mjs
npm run lint
npm run typecheck
npm run build
npm run test:browser:hipico
```

**Refactor y riesgos:** no añadir librería compartida de SW que obligue una nueva carga de red durante el install offline: ambos productos mantienen entrypoints y scopes distintos. No alterar `vercel.json` ni sus contratos de auto-deploy sin una decisión del propietario sobre habilitación de producción. El cierre #1292 aún requiere revocación/sesión/IndexedDB con pruebas multiusuario reales; #1291/#892 aún requieren corpus, API y LAB físicos autorizados. La cobertura de rutas codificadas y Unicode es conservadora: URLs malformadas y textos con invisibles pueden perder fallback/capacidad de consulta por seguridad. Revertir sólo con control equivalente.

## Segunda iteración: fallos de CI, invariantes financieros, caché PWA y parseo MUI

### Evidencia reproducible antes de tocar

- `main` permanece en `e7706f3dac3ae4c677fcdff05a662765fa6bdcc6`; el candidato fallido examinado fue `ad30e1e68106d06f1da0f39ba72cfc100460bac4`. Los cuatro errores TypeScript y los errores de sintaxis/configuración de más abajo existen en archivos idénticos en ese `main`; se consideran defectos **PREEXISTENTES**. Esto no permite llamar PASS a los gates.
- **ContaGest CI** [run 43906556026](https://github.com/adelvisMartin/ContaGest/actions/runs/43906556026), job 133436853238, `TypeScript` FAIL: `bank-reconciliation.service.ts:395` TS2554 (falta el cliente de transacción); `fiscal-withholding-application.routes.ts:209` TS2339 (`PurchaseInvoice.exchangeRate` no existe en schema); `payroll.routes.ts:129` TS2345 (efectos Zod tipados con montos optional); `service-catalog.service.ts:30` TS2322 (`Record<string,unknown>` no es JSON Prisma).
- **Hípico Production Build Runtime** [run 43906555930](https://github.com/adelvisMartin/ContaGest/actions/runs/43906555930), job 133436852346: pruebas PWA y LAB nuevas PASS. El build termina FAIL en `tests/reproducible_install_contract.test.mjs:27`: esperaba allowlist objeto, recibió `false` en `vercel.json` raíz. `frontend/vercel.json` ya define la allowlist exacta.
- **Verticales 49/51** [run 43906556147](https://github.com/adelvisMartin/ContaGest/actions/runs/43906556147), job 133436854321: `vite:import-analysis` no puede parsear `frontend/src/components/muiRuntime.js:63:820`, por paréntesis de más en `BreadcrumbsIsland`. Los cinco E2E fallaron en `qa/erp-visual-overlap-v4951.spec.mjs:152` porque `#pages` nunca se adjuntó. No se afirmó que el problema fuese el CSS o las vistas individuales.
- **Control Hipico QA Foundation:** fallo histórico de árbol sucio aún sin rutas de diagnóstico, retenido como BLOCKED/NOT_VERIFIED. Nuevo paso de `git status --short --untracked-files=all` en error conserva el gate fail-closed, no introduce skips.

### Correcciones integradas mínimas

| Archivo | Invariante corregido | Riesgo y verificación requerida |
| --- | --- | --- |
| `frontend/src/components/muiRuntime.js` | Se elimina un `)` sobrante del Breadcrumbs; el runtime vuelve a ser sintácticamente válido. | Gate nuevo `tests/mui_runtime_syntax_v4951.test.mjs` ejecuta `node --check` antes del Playwright; inspección visual por ruta pendiente. |
| `tests/reproducible_install_contract.test.mjs` | El root `git.deploymentEnabled=false` se reconoce como política **más estricta** que la allowlist; sólo el root admite este caso. | Regresiones rechazan `true`, valores ausentes, wildcard y ramas adicionales; el frontend sigue exigiendo coincidencia exacta de allowlist. **No se cambió** `vercel.json` ni se habilitó auto-deploy. |
| `backend/src/modules/bank-reconciliation/bank-reconciliation.service.ts` | `createLedgerEntry` exige un `Prisma.TransactionClient`; el write-off se crea en `prisma.$transaction`, incluyendo el guard de período, sin cambiar idempotencia ni posting posterior. | Alto riesgo financiero; PostgreSQL17 y concurrencia/replay E2E obligatorios. |
| `backend/src/modules/fiscal/fiscal-withholding-application.routes.ts` | La tasa FX=1 y moneda VES se validan contra **todas las líneas del asiento original contabilizado** (fuente persistida), en vez de leer una propiedad inexistente de PurchaseInvoice. | Alto riesgo fiscal; feature flag de posting sigue OFF por defecto; exige revisión legal y PG17. |
| `backend/src/modules/payroll/payroll.routes.ts` | Validación explícita de `gross/deductions/net` antes de comprobar la ecuación y antes de crear el recibo. | Mantiene verificación bruto=deducciones+neto; regresiones de nómina y tenant en base real pendientes. |
| `backend/src/modules/service-catalog/service-catalog.service.ts` | Auditoría recibe `Prisma.InputJsonObject` en lugar de `Record<string,unknown>`, sin conversiones `as any`. | Evaluar typecheck y auditoría transaccional real. |
| `frontend/public/sw.js` | Sólo guarda un asset si la respuesta HTTP es pública/permitida: rechaza `Cache-Control: private`, `no-store` y `Vary: *`; navegación ajena al entrypoint no puede sobrescribir el shell `index.html`. | `tests/pwa_private_query_guard_v1292.test.mjs` prueba que no se cacheen respuestas privadas y que el shell público sigue soportando offline. |

### Puertas y diagnóstico pendientes

1. En el **nuevo HEAD** ejecutar y revisar por separado `npm ci --no-audit --no-fund`, `node --test tests/reproducible_install_contract.test.mjs tests/mui_runtime_syntax_v4951.test.mjs tests/pwa_private_query_guard_v1292.test.mjs`, `npm run typecheck`, `npm run build` y los suites de nómina/contabilidad/fiscal, seguridad, PWA, LAB y Playwright Chromium/Firefox/WebKit. Los tests de `ad30e1e...` no validan nuevos SHA.
2. Completar PostgreSQL17 **efímero/aislado**, dos tenants y fixtures sintéticos con rollback/cleanup, write-off de creación/posting/replay/concurrencia y aplicación RETIVA sin alterar configuraciones productivas. No usar DB compartida ni mover flags financieros a ON.
3. Mantener `#1011` SOURCE no-read/no-send, `#1018` report links OFF, política de cifrado/revocación PWA y validaciones físicas Android/Windows. No confluir consultas de LAB con fuente regulatoria ni tratar previews como comprobantes.
4. Inspeccionar el diff final, artifacts/secret scan, `main` actual y **todos los required checks del HEAD** antes de merge. El nuevo candidato es provisional; estado **PARTIAL/NO_MERGE**.

**Rendimiento/cambio mínimo:** el match de parámetros consulta directamente el iterador de `URLSearchParams`; el helper `mayCachePublicResponse` sólo se consulta en respuestas elegibles y no introduce fetching adicional. Son mejoras de código, no mediciones de tiempo. El rollback revierte el commit respectivo sin alterar esquema ni datos, pero sólo con un reemplazo equivalente de las barreras de caché y seguridad.

## Iteración III — aislamiento de caché entre productos y migración de entradas anteriores

**Fecha:** 2026-11-16. **PR:** #1296. **Baseline fijo:** `main@e7706f3dac3ae4c677fcdff05a662765fa6bdcc6`. Esta iteración afecta `frontend/public/sw.js`, `frontend/public/hipico-control/sw.js`, `tests/pwa_private_query_guard_v1292.test.mjs` y el uso de importes estrechados en `backend/src/modules/payroll/payroll.routes.ts`. No incluye cambios de API, esquema, auth de backend, desbloqueo de SOURCE ni posting financiero nuevo.

### Amenaza que se mitiga

En un origen web compartido, la página controlada por el SW de Hípico puede iniciar peticiones de misma-origen fuera de `/hipico-control/`, mientras el SW general de ContaGest cubre la raíz; una navegación offline o un request autorizado mal encauzado podría recibir la shell de **otro producto**, o quedar cacheado bajo la shell incorrecta. La política anterior revisaba origen y rutas sensibles, pero no verificaba el límite de scope del SW Hípico ni la frontera `/hipico-control/` en el guard de ERP.

- El SW ERP deja pasar a red sin interceptar `/hipico-control[/*]` y `/control-hipico[/*]` (incluido el alias); además, no aplica fallback a `/api` o `/auth` sin barra final.
- El SW Hípico sólo intercepta peticiones cuya `url.pathname` está dentro de `self.registration.scope`. Las APIs globales fuera de scope dejan de pasar por su lógica de caché; la autoridad de API/backend sigue en servidor.
- Ambos workers evitan CacheStorage cuando la solicitud aporta `Authorization`, `X-Api-Key` o `X-Hipico-Bridge-Token`. Ninguna cabecera o valor privado se registra en logs; el short-circuit evita crear un array en cada `fetch`.
- En Hípico, aun una URL de asset permitido sólo se actualiza en runtime si la respuesta no declara `Cache-Control: private`, `no-store` ni `Vary: *`. La regla equivalente en ERP sigue vigente.
- **Migración de caché crítica:** ERP `CACHE_VERSION` pasa de `v563-2` a `v563-3`; Hípico `SHELL_CACHE` de `shell-r38-...` a `shell-r39-...`. La activación de los trabajadores nuevos ya elimina cachés de sus propias versiones anteriores; reutilizar la clave vieja permitiría arrastrar entradas potencialmente privadas desde el worker anterior. No se borran cachés del otro producto ni se propone eliminar indiscriminadamente IndexedDB.
- Nómina persiste las variables locales `gross/deductions/net` cuya presencia ya fue validada, en vez de propiedades de transporte tipadas como opcionales; misma ecuación exacta y mismo recorrido transaccional.

### Evidencia y regresiones

- La suite Node VM `tests/pwa_private_query_guard_v1292.test.mjs` se amplía para dos scopes, alias, requests con cabeceras privadas, respuestas HTTP privadas, disponibilidad de estáticos públicos, `activate` y `caches.delete` por namespace; ninguna prueba exige desactivar gates.
- **VALIDACIÓN SINTÉTICA EJECUTADA** mediante JS sobre **fuentes reales recuperadas de GitHub** en SHA `5ad64862c18313c94fbe51b24f1b247d2d37ccf3`: 12/12 casos en harness con URL/CacheStorage/fetch simulados, sin ejecución de navegador ni Playwright. Resultados: scopes ERP/Hípico separados; auth-header no guarda ni lee caché; red privada no se cachea; assets públicos sí; precache offline recuperable; `activate` elimina versión anterior y conserva otra aplicación. Este resultado es `LOCAL_SYNTHETIC` solamente; **no es el PASS de `node --test` ni de CI del HEAD definitivo**.
- **Verificación estática JS adicional** en `71b03b07d6f21b5190f4959fb39f620d8d610a53`: los dos workers compilaron sintácticamente; `muiRuntime.js` también compiló tras eliminar declaraciones de import/export sólo en el parser de prueba. No sustituye importación real por Vite o Playwright.
- La máquina local carece de checkout, PostgreSQL, browser/Android y DNS para clonar GitHub (`Could not resolve host: github.com`). `npm ci`, lint, typecheck completo, build Vite, Playwright, PG17 efímero, apk e integración LAB física se mantienen `NOT_EXECUTED/BLOCKED`.
- GitHub Actions del último HEAD deben revisarse y asociarse al SHA actual. `queued`, `pending` o `cancelled` no son PASS. No se ha solicitado merge ni se cierran issues.

### Riesgos residuales y reversión

- Cliente **que no se actualice** (sin red, instalación fallida, worker antiguo controlador) conserva el estado offline antiguo hasta una activación exitosa; exigir revocación/backend y matriz real `fresh login → offline → logout → switch owner/user/group` de #1292 antes de release.
- La prueba simulada de caché no valida IndexedDB, contenido privado en respuestas HTML de precache, revocación remota, backup, Android físico ni RLS/tenant del backend. No declarar cumplimiento integral de #1292.
- La rotación cambia la clave del caché, por tanto requiere reinstalación/recarga del shell público; está prevista como operación de actualización, no migración de datos. Revertir SW exigirá otra versión nueva de caché para no reabrir entradas inseguras. Mantener rollback de versiones y verificar reconexión antes de desplegar.
- **Estado:** PARTIAL / NO_MERGE. #1292, #1291 y #892 abiertos; el conjunto fiscal/hipico del PR aún no cumple los diez tickets.

## Iteración IV — origen público sin credenciales, guardas LAB homoglíficas y bloqueo externo de runners

**Fecha:** 2026-11-16 · **PR:** #1296 · **baseline main:** `e7706f3dac3ae4c677fcdff05a662765fa6bdcc6`. Candidato de código ensayado en harness V8 `cc37ebd4b544de516f05bbcdfca6c26eeff092ce` (la documentación posterior crea otro SHA). Ninguna escritura a producción/PG/WhatsApp, ni cambio en política Vercel.

### Amenazas verificadas por inspección y mitigaciones mínimas

1. **Precache cookie-bound:** la instalación ERP llamaba `cache.add(new Request(...))` y Hípico `cache.addAll([...])`. Ambas APIs CacheStorage pueden guardar una respuesta marcada `Cache-Control: no-store/private` y una petición con cookies implícitas. Ahora cada asset de precache se solicita con `new Request(url,{cache:'reload',credentials:'omit',redirect:'error'})`, se inspecciona y sólo después se guarda mediante `cache.put`. ERP conserva su precache best-effort (`Promise.allSettled`); Hípico mantiene el gate estricto de instalación (`Promise.all`, reject si asset privado/no válido). No hay fallback al HTML privado.
2. **Poisoning HTML durante navegación:** ERP ya no guarda ninguna respuesta a una navegación en `index.html`, ni siquiera en URL raíz; sólo el instalador sin credenciales puede alimentar la shell. En reconexión, la navegación sigue haciendo `fetch(request,{cache:'no-store'})` con estado original del navegador, pero la respuesta jamás pasa a CacheStorage; offline usa la shell pública instalada o 503 si falta. Se elimina una escritura y clonación por navegación.
3. **Recursos públicos con cookies:** `networkFirst` y refresh de assets públicos ERP utilizan `fetchPublicAsset` con `credentials:'omit',redirect:'error',cache:'no-store'`. Hípico usa idéntica política en el fetch runtime de la allowlist estática; los endpoints privados y rutas no permitidas mantienen su propio recorrido de red sin cachear. Ambos workers rechazan `Vary: Cookie`, `Authorization`, `X-Api-Key` o `*` y `Cache-Control: private/no-store`.
4. **Revisión de SW inconsistente:** `frontend/public/pwa-install.js` registra ahora `sw.js?v=563-3`, alineado a `CACHE_VERSION='v563-3'`. Una prueba enlaza ambos números para impedir futuras divergencias. La rotación de cache namespaces de la iteración previa permanece.
5. **Bypass mediante URL alternativa:** los nombres de parámetros son comparados tras normalización Unicode NFKC (p.ej. `ｔ` y `ａｃｃｅｓｓ＿ｔｏｋｅｎ`). Se rechaza `%25` (encoding duplicado) en rutas antes de aplicar fallback offline. El SW ERP normaliza la ruta decodificada a minúsculas para cubrir `/API`/`/AUTH` conforme al backend case-insensitive; Hípico ya empleaba regex con flag `i`. Los casos positivos de queries públicas y navegación offline permanecen.
6. **LAB homoglifos + citas:** `normalizeQuery` aplica NFKC antes de desacentuar, detectando `ｐａｇａｒ`; se deniega mezcla latín/cirílico/griego que pueda disfrazar acciones (`рagar`, `αctualizar`). La misma función `unsafeLabText` se aplica tanto al texto citado como a la respuesta actual antes de heredar una referencia de carrera desde un mensaje LAB visible del mismo remitente. Las secuencias ZWJ de emoji quedan permitidas. Es una regla restrictiva para preguntas LAB en español, **no** un normalizador multilingüe general; no cambia SOURCE ni autoriza transacciones.

### Regresión agregada y ejecución disponible

- `tests/pwa_private_query_guard_v1292.test.mjs`: interceptación por producto, token en query con compatibilidad Unicode, double encoding, rutas API mayúsculas, headers sensibles, cache privado y Vary identidad, precache de instalación, `credentials:'omit'`, `redirect:'error'`, navegación que nunca escribe la shell, activación y migración. Se actualizó `.github/workflows/pwa-offline-v563.yml` para lanzar el gate incluso si sólo cambia el archivo de regresiones.
- `tools/hipico-whatsapp-web-bridge/tests/lab-obfuscated-query-v1291.test.mjs`: corpus homoglifos, fullwidth, direct canonical adapter (sin llamada HTTP) y quoted race scope inseguro, más caso positivo de conversación legítima.
- **EJECUTADO**: análisis sintáctico de fuente real MUI/2 workers y **27/27** comprobaciones de comportamiento sintético en entorno JS V8 sin browser, sobre `cc37ebd4b544de516f05bbcdfca6c26eeff092ce`; anteriormente **11/11** escenarios LAB adicionales sobre `9e042f5939bf87f864ab96990e40b6dc12975638`. Se usaron dobles sintéticos únicamente en memoria; no hubo conexión a fuentes externas. Estas ejecuciones **NO equivalen** a `node --test`, `npm run typecheck`, build Vite, Playwright, PG17 real, Chromium/Firefox/WebKit ni Android.
- **Bloqueo CI externo observable:** jobs de Actions en `a988c407...` (run 43920192742 `validate`) permanecieron en cola hasta ser cancelados por commits posteriores sin iniciar sus steps. En `cc37ebd4...`, los workflows de `ContaGest CI`, `Hípico Production Build Runtime`, `PWA offline`, `security-baseline`, `Control Hipico QA Foundation` y matriz visual estaban `queued/pending` sin PASS. Tratar como `REMOTE_CI BLOCKED/PENDING`, no transformar en PASS ni relajar required checks.
- **Riesgo residual alto:** sin navegador real no se ha probado la migración del SW en clientes antiguos, desconexión/reconexión, sesión revocada, SSR/proxy autenticado, IndexedDB y Android; sin PostgreSQL efímero aislado no se han probado montos fiscales, multi-tenant, idempotencia ni write-off; sin Windows LAB real/soak no se certifica entrega. Todos son gates independientes y siguen pendientes; #1011 SOURCE read/send continúa restringido, #1018 shares no se habilita.
- **Rollback:** si una instalación no obtiene assets públicos sin cookies, el nuevo SW falla cerrado (Hípico) o deja 503 offline para recursos faltantes (ERP). Revisar política de acceso estático/proxy, pero **no revertir silenciosamente a `cache.addAll` autenticado** ni reutilizar nombres de caché antiguos. No hay migraciones DB; se puede revertir el código con bump de versión y nueva validación de los consumidores.

**Estado de release: PARTIAL / NO_MERGE.** No declarar DONE para #1292/#1291/#892 ni los restantes tickets fiscales y de Hípico mientras falten gates exact-SHA y aceptación real.

## Iteración V — idempotencia offline y revocación de estado por sesión

**16-nov-2026 · PR #1296 · baseline `main@e7706f3dac3ae4c677fcdff05a662765fa6bdcc6`**.

### Hallazgos técnicos y correcciones

1. **Idempotencia E2E que no concordaba con IndexedDB:** `qa/pwa-offline-v563.spec.mjs` exige que un segundo `enqueueOfflineOperation` con mismo tenant, operation y key devuelva el evento original. La implementación anterior hacía `store.add(record)` sin comprobar si ya existía; el segundo intento podía lanzar `ConstraintError`. Ahora `store.get(id)` y la inserción/decisión se realizan dentro de la **misma transacción readwrite**. El reintento idéntico devuelve el registro persistido con `createdAt` original; un cuerpo distinto o no serializable provoca `OFFLINE_IDEMPOTENCY_CONFLICT`; no hay sustitución de payload, permiso financiero añadido ni borrado de intentos fallidos. El adaptador de flush sigue exigiendo ACK explícito.
2. **Eliminación por prefijo de cachés e IndexedDB:** `purgeOfflineSession` borraba nombres que empezaban por el hash de la sesión; eso podía afectar un identificador distinto que compartiera prefijo. Ahora sólo elimina la clave exacta de sesión del namespace legado `contagest-ve-v563-session-` y del worker activo `contagest-ve-v563-3-session-`; `purgeIndexedDb` limita el borrado a la base cuyo nombre coincide exactamente. No se borran datos ajenos ni se cambia la versión de la BD.
3. **Carrera `serviceWorker.ready` vs logout/switch:** `postToServiceWorker` enviaba en forma inmediata al controller y posteriormente a `registration.active`, susceptible de reproducir un `SET_SESSION_SCOPE` viejo después de un logout o cambio de tenant. Si ya hay controller se envía sólo una vez; de lo contrario, el envío diferido se permite únicamente si `sessionScope(parseStoredSession())` todavía coincide con el scope solicitado. `CLEAR_SESSION_DATA` mantiene su ruta de purga.
4. **QA positiva y negativa por usuario:** la prueba E2E de logout/tenant switch construye datos sintéticos en ambas revisiones de CacheStorage, dos sesiones/outboxes IndexedDB y una base/cache vecina con prefijo coincidente; exige eliminar únicamente el tenant A, conservar B y la vecina, y garantiza limpieza de fixtures en `finally`. El E2E de outbox exige mismo ID/ACK y rechaza conflicto sin permitir cambio en la entrega. `tests/pwa_session_scope_v1292.test.mjs` comprueba en Node VM el worker-ready tardío y el borrado exacto; el workflow PWA se actualizó para disparar y ejecutar ese test, sin omitir browser, build ni contracts existentes.

### Evidencia ejecutada y gates

- `enqueueOfflineOperation` extraída **sin reimplementar el código de negocio** de la fuente GitHub: **6/6** casos de un simulador transaccional sintético en el blob `51f65c2e1e5e09e0f1cf6a7f1462ea96fa11fe0b`: alta, reintento, conflicto, payload cíclico, tenant B aislado y ledger prohibido. No hubo HTTP ni fuentes reales.
- `setServiceWorkerSession` y `postToServiceWorker` reales: **4/4** comprobaciones sintéticas en blob `616609114dbc0a0359c97ab86a298c3c7f8719c2` (conmutación A→B, login actual, entrega única al controller y logout). Estos son resultados de funciones ejecutadas con dobles `navigator`/`IndexedDB` en V8, **no** resultados del runner Node ni de Chromium.
- Parser sintáctico V8 con transformación lexical ESM aplicada a `pwaOfflineService.js`, `qa/pwa-offline-v563.spec.mjs`, las dos suites de pruebas VM y ambos workers: compilación sin errores observados. **NO** equivale al test runner, Vite ni a módulos cargados por browser.
- `npm ci`, `npm run agent:gates -- --base main`, lint/typecheck/build, PostgreSQL17 efímero, Playwright Chromium/Firefox/WebKit, Windows LAB/Android físico y despliegue/runtime: **NOT_EXECUTED/BLOCKED** (sin checkout/DNS GitHub ni Docker/PG local). Las ejecuciones GitHub Actions del HEAD deben consultarse por SHA; se observaron **queued/pending**, sin PASS de los jobs requeridos. En la consulta a Jobs del SHA previo `8f77d609...`, `validate`, `contract` y `production-build-runtime` seguían `queued`, sin steps ejecutados. Nuevos SHAs invalidan esa evidencia como gate final.
- Revisión de código afecta únicamente límites de PWA/outbox y tests/regresiones; no esquema DB, tokens, secretos, SOURCE automático ni despliegue a producción. **No se solicita merge ni cierre de #1292/#1291/#892**.

### Riesgos residuales / acciones antes de release

- **Persistencia bloqueada por otras pestañas:** `indexedDB.deleteDatabase` existente trata `onblocked`/`onerror` como respuesta cumplida; si la eliminación queda realmente bloqueada, la UX aún no garantiza aviso y reconfirmación. Retener #1292 abierto; comprobar esa condición en Chromium real y diseñar recuperación/alerta sin ocultar logout.
- Las claves de ámbito usan hashes FNV32 de tenant/usuario para nombres locales; no ofrecen aislamiento criptográfico ni sustituyen la autorización del backend. Validar RLS y cambios de identidad reales y estudiar migración versionada si el threat model lo exige.
- Los reintentos concurrentes usan serialización transaccional real de IndexedDB que **todavía debe validarse en Chromium**, no está probado por el simulador. Revalidar todos los contratos del HEAD exacto antes de cambiar estado a DONE.

**Resultado: PARTIAL / NO_MERGE.** Un checklist queued no acredita PASS; los cambios de código aún no constituyen garantía de producción.

## Iteración VI — revocación verificable, single-owner PWA y aislamiento ERP/Hípico

**Fecha:** 2026-11-16 · **PR:** #1296 · **base `main`:** `e7706f3dac3ae4c677fcdff05a662765fa6bdcc6`. Los cambios son incrementales y se dejan en DRAFT / NO MERGE. El SHA de código antes de esta edición documental es `30d71886d2e3eecdc9623fc42db813eed9654e36` (92 commits; cualquier commit adicional requiere gates nuevos).

### Invariantes vulnerados encontrados en la inspección

1. **`indexedDB.deleteDatabase` ocultaba onblocked/onerror como éxito:** el servicio de ContaGest resolvía el Promise incluso cuando otra pestaña retenía el handle. Se cambió por fallo explícito `OFFLINE_DB_DELETE_BLOCKED`/error; `purgeOfflineSession` intenta en forma independiente WebStorage, mensaje al worker, CacheStorage e IndexedDB; si uno falla devuelve `OFFLINE_SESSION_PURGE_FAILED` después de intentar todos los almacenes. Un bloqueo puede completarse más tarde y **no se presenta como ya completado**. No se borran bases ajenas ni se añaden temporizadores o sleeps.
2. **Logout hacía pasar revocación no confirmada por completada:** `AuthService.logout()` sigue limpiando identidad local primero y ejecutando revocación remota; ahora preserva y comunica si falló la purga local (`OFFLINE_SESSION_PURGE_FAILED`) o si el servidor no confirmó revocación (`AUTH_REMOTE_LOGOUT_UNCONFIRMED`). Si fallan ambos prevalece la advertencia de borrado local incompleto. `frontend/src/app.js` navega a login sin dejar la Promise sin manejar y muestra éxito únicamente tras completar ambas fases; avisa claramente del riesgo en los estados de error.
3. **Propietarios dobles de registro SW y script de instalador duplicado:** `frontend/src/app.js` registraba `./sw.js` y añadía otro `controllerchange`; `frontend/public/pwa-install.js` registraba `sw.js?v=563-3`; además el plugin `frontend/vite.config.js` inyectaba otro `/pwa-install.js` pese a que el `index.html` canónico ya incluía `./pwa-install.js`. Se eliminó el segundo registro/listener y la inyección duplicada. El instalador PWA original es el único dueño; el transformador privado mantiene una única carga, las páginas de marketing no reciben el instalador.
4. **Limpieza en localhost destruía datos de otro producto y bloqueaba pruebas:** el código previo de `app.js` hacía `getRegistrations().unregister()` y `caches.keys().delete()` globales. Se eliminó esa limpieza destructiva; el instalador registra igualmente en `127.0.0.1:8080` para el `playwright.config.mjs` existente. La primera propuesta de omitir el SW en localhost fue descartada al consultar el contrato real de Playwright: habría provocado falso FAIL en el E2E, sin mejorar la seguridad de producción.
5. **Evicción cross-product por nombre genérico:** `frontend/public/sw.js` borraba cualquier caché cuyo nombre contuviera `-session-`, independientemente del dueño. La activación sólo borra namespaces obsoletos con prefijo `contagest-ve-`; la migración conserva el namespace activo y nunca toca Hípico ni otras apps. La limpieza ERP de `sessionStorage` también dejó de borrar claves `hipico_`.

### Regresiones agregadas o reforzadas

- `tests/pwa_session_scope_v1292.test.mjs`: simula bloqueos y errores de IDB; garantiza que falla el borrado y se intenta el otro almacén; ejecuta la transformación real `transformIndexHtml.handler` de Vite para exigir **una sola** inclusión de instalador; comprueba preservación de claves `hipico_` y ámbito ajeno.
- `tests/pwa_auth_logout_v1292.test.mjs`: extrae y ejecuta el método de logout real con límites sintéticos, cubriendo éxito, remoto sin confirmar, local bloqueado y fallos simultáneos; vigila aviso UI y rechazo de una promesa desatendida.
- `tests/pwa_private_query_guard_v1292.test.mjs`: añade cachés `hipico-control-session-*` y `another-product-session-*` como regresiones negativas en la activación ERP.
- `qa/pwa-offline-v563.spec.mjs`: Playwright verifica una sola etiqueta instaladora y una única registration raíz; mantiene el E2E del ciclo offline/online y la conciliación entre tenants, añade prueba con IndexedDB **nativo** mantenido abierto para provocar `onblocked` y limpieza de fixtures en `finally`; comprueba que el ERP no borra `sessionStorage` Hípico.
- `.github/workflows/pwa-offline-v563.yml`: ahora escucha `frontend/src/app.js`, `frontend/vite.config.js` y las nuevas suites, corre los tests Node de sesión/auth junto a los existentes, conserva `npm ci`, frontend build, Chromium y artifacts.

### Ejecución y evidencia por fuente

- **EJECUTADO, entorno V8 sintético:** 5/5 sobre el `pwaOfflineService` original (borrado IDB completo, `blocked`, error, fallo de CacheStorage con intento de IDB y no afectación de namespace Hípico); 4/4 sobre el método `AuthService.logout` extraído de fuente real (éxito, fallo remoto, fallo local, ambos); 3/3 sobre activación SW, logout de storage cruzado y registration en `127.0.0.1`; 7/7 chequeos de `Vite.transformIndexHtml.handler` ejecutado con URL de fuente falsa y ownership de PWA. **Todas estas cifras son simulaciones con dependencias dobles**, nunca `node --test`, Playwright real ni build.
- **NO EJECUTADO/BLOCKED:** `npm ci`, `npm run agent:gates -- --base main`, lint, typecheck, build Vite, suite Node, CI efectiva, PostgreSQL17 efímero, Firefox/WebKit, Android real y revocación de cookie en backend. Sin checkout local ni conexión GitHub desde el container; Actions permanece en `queued/pending`. El proceso no declara el P0 #1292 completo.
- **Riesgos residuales:** un delete IDB bloqueado puede completarse tras la advertencia al cerrar otra pestaña; la UX pide cerrarlas y reintentar; confirmar en Chromium real. El cierre offline limpia identidad local pero no puede revocar una cookie válida del servidor sin conectividad; se avisa pero no se inventa revocación. Aún no hay prueba Android, multigrupo Hípico ni ciphertext/guardado local de reportes privados. La instalación del shell en redes con interceptores necesita gate real. Aislamiento criptográfico y RLS backend siguen siendo una defensa distinta.
- **Reversión:** revertir cambios de client auth/PWA/test juntos, conservando cache namespace vigente; no restaurar doble instalación ni borrado global de cachés. Si se requiere reversión de SW en producción, incrementar la versión de worker tras pruebas de migración, nunca reutilizar cachés potencialmente privados.

**Veredicto:** `PARTIAL / NO_MERGE` hasta verde real en exact HEAD y evaluación de #1292/#1291/#892 con sus criterios de aceptación, sin SOURCE autónomo, datos privados de terceros ni endpoints nuevos.
