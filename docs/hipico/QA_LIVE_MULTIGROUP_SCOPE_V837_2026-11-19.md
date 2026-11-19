# #837 · Corrección de aislamiento de grupos en UI Hípico — QA y benchmark

**Baseline:** `main@bb13003cb77efc1c4c37390a0c6d8414f6232aa9`, 2026-11-19.
**Owner:** #837 Hípico PWA; **No confundir** con #839 QA físico/soak/release ni con PR #1367 (snapshot LAB) o #1368 (integridad de evidencia).
**Estado al redactar:** SOURCE_REVIEW verificado por rutas del código, pruebas en candidato GitHub aún no ejecutadas en CI.

## Problema reproducible y recorrido real

- `frontend/public/hipico-control/index.html` carga `assets/js/app.js` como módulo. `race-finalization.js` **no** se carga en ese documento; usa `control-hipico-db`, mientras el storage activo de `store-v2.js` utiliza `hipico-control`. No activar la ruta huérfana para corregir el problema del frontend en uso.
- `app.js` utilizaba `groupItems(items, groupId)` con `!item.groupId || item.groupId === groupId`: un registro legado sin `groupId` se mostraba en **todos** los grupos. Esto alcanzaba consultas de participantes, carreras, operaciones/historial y resúmenes, con riesgo de mezclarlos visualmente.
- `operational-ledger.js` ya tiene `scopeItems(workspace, items, groupId)` y establece que un registro legado sin grupo pertenece **solo al primer grupo conocido**. Tests de dominio previos (`hipico_multigroup_hardening_279` y `hipico_multigroup_runtime_277`) protegen esa convención.
- La corrección cambia el consumidor real `app.js` para usar `scopeItems` canónico; no se crean tablas, APIs, reglas contables, permisos ni una segunda función de agrupación.

## Criterios adicionales

- [ ] **AC-MG-01 / negativo:** estando en grupo B, una fila heredada sin `groupId` del grupo A no aparece en socios, carreras, registros ni reportes de B.
- [ ] **AC-MG-02 / positivo:** el grupo A conserva acceso a registros históricos sin `groupId` y los grupos B/C ven únicamente sus filas etiquetadas.
- [ ] **AC-MG-03 / regresión:** cambiar de grupo, refrescar PWA, cerrar sesión y reabrir workspace no reintroduce filas cruzadas; no cambia liquidación, comisión, FX, snapshots ni outbox.
- [ ] **AC-MG-04 / UX:** estados vacío/loading/error si un grupo carece de carreras o socios; verificar foco, navegación y responsive 360/390/430/768/1024/1440 y temas.
- [ ] **AC-MG-05 / release:** Node22 `npm ci`, `node --test tests/hipico_live_multigroup_ui_scope_v837.test.mjs tests/hipico_multigroup_hardening_279.test.mjs tests/hipico_multigroup_runtime_277.test.mjs`, `npm run test:hipico`, `npm run qa:hipico`, checks exact-SHA. No marcar PASS sin ejecutar.
- [ ] **AC-MG-06 / permisos:** backend/DB rechazan consultas cruzadas por owner/tenant; esta corrección solo trata presentación local, **no sustituye autenticación ni RLS**.

## Actualización de la PWA y consistencia offline

**SOURCE_VERIFIED:** `sw.js` servía `app.js` desde `SHELL_CACHE` en modo *cache-first* y el shell anterior `r39` no se invalidaba con un cambio solo en `app.js`. Sin rotación, un cliente PWA controlado podía mantener el JS legado incluso después de corregir el código del repositorio. El incremento mínimo `r39→r40` en `SHELL_CACHE` fuerza a una nueva instalación a precargar recursos estáticos con `credentials: omit`; `activate` elimina caches anteriores de este namespace, no IndexedDB, workspace, saldos, licencias ni outbox. `pwa-update.js` ya gestiona `registration.update()`, `skipWaiting` y una recarga acotada al cambio de controlador.

**QA específico:** `tests/hipico_live_multigroup_ui_scope_v837.test.mjs` verifica que `index.html` cargue `app.js`, que SW use revisión de shell al menos 40, que `app.js` / `operational-ledger.js` / `pwa-update.js` estén en precache y que la rotación conserve limpieza de caches, adopción de cliente y ausencia de borrado de IndexedDB. `tests/hipico_shell_cache_revision_contract.test.mjs` ya permite versiones posteriores a r39 y protege namespace, navegación y privacidad. Esto es **contrato de código**; la instalación/actualización real offline en Chromium/Android queda `NOT_EXECUTED`.

## Matriz de regresión y performance

Casos sintéticos 1000×: grupos A/B/C, default A, sin grupo legado, selección grupo, grupo desconocido, sin registros; filtrado por `scopeItems` debe ser determinista. Los 1000 escenarios modelados/ejecutados en prueba Node no son 1000 ciclos de refactor ni pruebas de backend/PostgreSQL/Android.

**Microbenchmark focalizado Node 22 (copia aislada, 2026-11-19):** 1.000 participantes, 2.200 filas de historial, 2 etiquetas por fila. El algoritmo anterior construía 4.400 mapas de participantes por renderizado; el nuevo construye **1** y reutiliza sus búsquedas en las vistas móvil/escritorio. Salida textual de códigos idéntica en ambos algoritmos. En **una sola ejecución sintética** de `node bench-history.mjs` se observaron **218,02 ms vs 0,25 ms**. Es un resultado del *modelo focalizado*, no del navegador, UI real, PWA, ni benchmark regulatorio de cargas: el benchmark local no forma parte del repositorio y el delta de latencia del producto continúa **NOT_EXECUTED**.

**Seguridad de la optimización:** el índice se crea de nuevo en cada `renderHistory()`, nunca se almacena en caché global, en `localStorage` ni entre identidades; el índice utiliza `groupItems(workspace.participants)` canónico con grupo activo. Prueba negativa de ID compartido A/B y cambio de grupo evita alias de etiquetas. Los dos bucles de historial reutilizan una instantánea de participantes durante la misma renderización y conservan escapes y saldo/formato originales.

**QA adicional:** test 1.000 configuraciones multi-grupo variables (2–8 grupos, `groups` y `whatsappGroups`, filas sin `groupId`/null/empty, grupos desconocidos y selección activa), más los 1.000 casos iniciales. Se valida no mutación de registros y comportamiento al cambiar de grupo. El test de integración estática exige explícitamente **una construcción del índice** por render y referencias de móvil/escritorio al mismo índice. Estos 2.000 escenarios no son pruebas browser/E2E ni 100 refactors.

**Performance:** ambos filtros son O(n); no hay mejora demostrada en LCP/INP/API p95. Medir antes/después en device PWA antes de cualquier claim de velocidad. La prioridad es evitar un resultado incorrecto o privacidad accidental.

**FODA:** Fortaleza: helper canónico y tests ya integrados; Oportunidad: reusar la convención existente, reducir duplicación y evitar reconstruir índices por fila; Debilidad: selección UI histórica permisiva (SOURCE_VERIFIED) y coste O(historial×participantes) en render de histórico (SOURCE_VERIFIED); Amenaza: visibilidad cross-group de datos locales, etiquetas obsoletas, estados obsoletos o una segunda autoridad de liquidez. Mitigación NOW: filtro canónico + negativos automatizados; FOLLOW_UP: investigar archivo `race-finalization.js` huérfano y sus posibles consumidores antes de cualquier eliminación, bajo #1294; REJECT: activar flujo de liquidación alternativo o copiar remates externos.

## Investigación competitiva de remates (advisory, sin scraping privado)

**Fuente pública, 2026-11-19:**
- Tattersalls Online [How it works](https://www.tattersallsonline.com/help/how-it-works/) y [FAQ](https://www.tattersallsonline.com/help/): catálogo de lotes, aprobación/registro, oferta máxima, reserva y ventana de cierre.
- ARQANA [How to bid](https://www.arqanaonline.com/how_to_bid.html): posición de oferta y colisión simultánea en el lote.
- [OWASP Multi-Tenant Security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html), [MDN IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction): aislamientos/atomicidad de operaciones; no asumir que IndexedDB es autorización del servidor.

**Aplicabilidad:** #1010 está cerrado por consolidación administrativa dentro de #837, pero su ADR requiere confirmar que remates son producto realmente deseado, los roles, precio de reserva, moneda y autoridad de caja *antes* de diseñar schema/pagos. Remate de caballos (pujas/adjudicación) y apuestas de carrera (pizarras/liquidaciones) son dominios distintos. Ni este fix ni el benchmark abren pagos reales, pujas online, extracción privada o autoenvío WhatsApp SOURCE.

## Evidencia y riesgos pendientes

| Gate | Estado en este anexo |
| --- | --- |
| Código fuente y rutas | SOURCE_REVIEW |
| 2 suites de scope × 1.000 en Node aislado con helper transcrito | PASS aislado, **NO** repositorio completo |
| 7 pruebas focalizadas Node22 (copia mínima de snippets) | PASS aislado; test sobre archivos originales NOT_EXECUTED |
| Test del nuevo archivo contra checkout real | NOT_EXECUTED hasta CI/checkout |
| PG17 tenant/owner A/B | NOT_EXECUTED; sin cambios API/DB |
| Microbenchmark sintético de render de códigos (Node22, 1 ejecución) | OBSERVED aislado; NO producción ni browser |
| Renovación offline de SW y caché r40 | SOURCE_REVIEW; prueba real PWA NOT_EXECUTED |
| Browser/mobile/Playwright, claro/oscuro | NOT_EXECUTED |
| Hípico Physical QA/soak/restore | NOT_EXECUTED; owner #839 |
| CI GitHub candidate SHA | PENDING al crear PR |
| Google Play Hípico | OUT_OF_SCOPE |
| WhatsApp SOURCE autoleer/autoenviar | BLOCKED_POLICY |

No declarar DONE sin evidencia material exact-SHA. El archivo `race-finalization.js` es un hallazgo de código no enlazado, **no** el flujo operativo actual; investigar consumer proof en follow-up antes de borrarlo.
