# PR #1282 — Auditoría de implementación, seguridad y aceptación

**Fecha:** 2026-10-22. **Fuente revisada:** `adelvisMartin/ContaGest` (rama `feat/637-773-849-852-854-safe-authority-20261022`). **SHA pre-documental:** `c87cc4d772f4f6ebd5a5fc9c7f48183526d88b3c`. La evidencia debe repetirse sobre el HEAD final posterior a este documento y luego sobre el SHA de merge. **NO RELEASE/NO MERGE, cinco issues abiertos.**

## Cambios efectivos y límites por ticket

| Ticket | Implementado o endurecido | Bloqueadores materiales de DoD |
| --- | --- | --- |
| #637 | cierre y apertura contable como comandos de servicio, actor+auditoría misma transacción, lock por tenant/período compartido en `assertPeriodOpen(...,tx)`, caracterización auth QA con UserSession real | otros writers financieros, módulo de cierre `all`, prueba PG17 de efecto monetario, reconciliación, revisión FX/impuestos y usuarios A/B |
| #773 | CgSelect (helper/error/disabled/empty), CgDialog (type y pending), CgDataTable (label/región teclado), focus MUI/ARIA/forced-colors y contrato de matriz visual | screenshots, real browser, light/dark/system, 200% zoom, 58 rutas x viewports, comparativa por todas las verticales |
| #849 | step plan denso y límites/version; proyección pública allowlisted, con negativos cross-tenant/PII | Category/Service/Step models normalizados, Product/pricing link, staff/location/resources BIDI, API admin/public, editor y snapshots booking |
| #852 | proyección ledger BigInt secuencia contigua y `RELEASE` limitada; resolver puro de elegibilidad por vigencia/scope/location/prioridad, nunca autoriza write | PostgreSQL snapshot/append-only/effectKey, consumo concurrent-safe, rollback booking y vínculo Gym #746, refund/release/inapp QA |
| #854 | plantillas y recipient policy existentes; timelines seguros; se eliminó la emisión WhatsApp automática a `order.phone` sin consentimiento, HTTP 503; proveedor ack puro para adapter futuro | canal in-app real, consent/prefs persistidas, intent transaccional #853 (infraestructura existe pero sin wiring del handler), adapter #772 firmado, retry/receipt, panel y E2E |

## Falsas equivalencias que este PR evita

- `HTTP 200` del proveedor **no** demuestra `delivered`; status sólo con webhook/recepción verificada.
- El payload `order.phone` del navegador y permiso `sales.manage` **no** demuestran el consentimiento del destinatario.
- `remaining` derivado de eventos **no** es un saldo autorizable sin lock de base de datos.
- `pg_advisory_xact_lock` sólo coordina a escritores que comparten el convenio de lock dentro de la misma transacción.
- Un servicio público sin datos de costo/PII **no** es un catálogo persistido ni booking.
- Ejecución de tests de fuente/vistas puras aisladas **no** es build, DB integration, browser ni QA certificado.
- La existencia de `AsyncJobIntent` de #853 **no** significa que las notificaciones tengan worker/provider operativos.

## Evidencia concreta y estado

- Fuente/contratos ejecutados aisladamente usando runtime JavaScript del conector: cuatro checks del mutex contable, siete del resolver #852, seis de proyección #849, quince de notificaciones y cuatro de Cg*: **PASS AISLADO**, sin instalar workspaces. **No equivalen a npm test**.
- Scripts nativos registrados en `backend/package.json`: tests de #637/#773/#849/#852/#854. Solo son **NOT_EXECUTED NATIVE** mientras no exista checkout con dependencias.
- Test PG17 preparado: `CG_ACCOUNTING_PERIOD_QA_ISOLATED=true npm run test:backend:accounting:period:real`. Requiere base desechable y conexión PostgreSQL 17. **NOT_EXECUTED**; deja período/QA audit en DB aislada.
- `npm ci && npm run typecheck && npm run build && npm test`: **NOT_EXECUTED LOCAL** (runtime sin clon completo y sin red a GitHub).
- PG17 from-zero/upgrade/two tenant/financial/effect/resolution: **NOT_EXECUTED**.
- Playwright 58 rutas, Chromium/Firefox/WebKit, zoom y WCAG: **NOT_EXECUTED** sobre HEAD.
- GitHub Actions del HEAD previo `c87cc4d772f4f6ebd5a5fc9c7f48183526d88b3c`: 57 checks publicados, 46 `queued`, 11 `skipped`, **0 PASS** al momento de consulta. Deben reconsultarse para HEAD final.
- Historial CI del SHA `7af1e338`: PostgreSQL persistence rechazaba bearer sin `sid`; contratos cross-tenant, CRM assets, captcha/browser, decimal y accesibilidad registraron otros fallos. **No reutilizar aprobaciones de SHA anterior**; comparar contra main cuando estén disponibles.

## Comandos de QA exactos

```bash
npm ci
npm run typecheck
npm run build
npm test
npm run test:backend:persistence:real
npm run test:backend:financial:decimal:real
CG_ACCOUNTING_PERIOD_QA_ISOLATED=true npm run test:backend:accounting:period:real
npm run test:browser:58
```

La secuencia PG requiere `DATABASE_URL` y seeds **desechables**, nunca producción. Para emitir un RELEASE_READY: todo gate material debe tener ejecución reproducible en SHA exacto, sin desactivar checks, y documentos de evidencia/provenance. Si está en cola por cuota: anotar BLOCKED en vez de PASS.

## Normas y bibliografía técnica

- Código de Comercio de Venezuela, arts. 32–37: https://www.wipo.int/wipolex/es/legislation/details/4008
- SNAT/2024/000102 G.O. 43.032, arts. 3/7/12/29: https://tributos.ivecofi.net/informacion/legislacion/providencias/pa-2024-102
- Ley Protección Privacidad Comunicaciones, G.O. 34.863/1991: https://venezuela.justia.com/federales/leyes/ley-sobre-proteccion-a-la-privacidad-de-las-comunicaciones/gdoc/
- PostgreSQL 17 advisory locks: https://www.postgresql.org/docs/17/explicit-locking.html

Las fuentes son documentación pública; **no** prueba de aprobación/validación por SENIAT, soporte legal individual ni cumplimiento general.

## Rollback/seguridad operativa

Mantener PR DRAFT mientras haya bloqueadores. Revertir cambios por commit y dominio si aparecen regresiones. Este lote no ejecutó migraciones SQL, no llamó proveedores externos ni alteró datos comerciales de clientes. Conservar issues #637, #773, #849, #852 y #854 en backlog hasta que se cumpla la DoD verificable. No cerrar a causa de que un PR exista.
