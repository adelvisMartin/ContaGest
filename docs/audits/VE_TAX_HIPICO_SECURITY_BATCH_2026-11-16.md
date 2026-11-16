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
