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

## Matriz de regresión y performance

Casos sintéticos 1000×: grupos A/B/C, default A, sin grupo legado, selección grupo, grupo desconocido, sin registros; filtrado por `scopeItems` debe ser determinista. Los 1000 escenarios modelados/ejecutados en prueba Node no son 1000 ciclos de refactor ni pruebas de backend/PostgreSQL/Android.

**Performance:** ambos filtros son O(n); no hay mejora demostrada en LCP/INP/API p95. Medir antes/después en device PWA antes de cualquier claim de velocidad. La prioridad es evitar un resultado incorrecto o privacidad accidental.

**FODA:** Fortaleza: helper canónico y tests ya integrados; Oportunidad: reusar la convención existente y reducir duplicación; Debilidad: selección UI histórica permisiva (SOURCE_VERIFIED); Amenaza: visibilidad cross-group de datos locales, estados obsoletos o una segunda autoridad de liquidez. Mitigación NOW: filtro canónico + negativos automatizados; FOLLOW_UP: investigar archivo `race-finalization.js` huérfano y sus posibles consumidores antes de cualquier eliminación, bajo #1294; REJECT: activar flujo de liquidación alternativo o copiar remates externos.

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
| Filtro canónico en prueba Node aislada sobre helper transcrito | PASS aislado, **NO** repositorio completo |
| Test del nuevo archivo contra checkout real | NOT_EXECUTED hasta CI/checkout |
| PG17 tenant/owner A/B | NOT_EXECUTED; sin cambios API/DB |
| Browser/mobile/Playwright, claro/oscuro | NOT_EXECUTED |
| Hípico Physical QA/soak/restore | NOT_EXECUTED; owner #839 |
| CI GitHub candidate SHA | PENDING al crear PR |
| Google Play Hípico | OUT_OF_SCOPE |
| WhatsApp SOURCE autoleer/autoenviar | BLOCKED_POLICY |

No declarar DONE sin evidencia material exact-SHA. El archivo `race-finalization.js` es un hallazgo de código no enlazado, **no** el flujo operativo actual; investigar consumer proof en follow-up antes de borrarlo.
