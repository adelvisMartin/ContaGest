# Import/Export empresarial · incremento de portabilidad #770

**Scope:** exportación de maestros (`clients`, `suppliers`, `products`) derivada del servidor, sin consultar tablas por nombre de usuario ni confiar en filas suministradas por el navegador. La importación existente en `backend/src/modules/imports/imports.routes.ts` **se mantiene intacta**: ya implementa dry-run, checksum, idempotencia, tenant-scoping y staging, que deben reutilizarse en lugar de duplicarse.

**Baseline:** `main@5c1b4a940867aac1581dcf2c2deb7e4a4145431a` al abrir rama `feat/770-server-owned-portability-export-20261015`. **Ownership exclusivo:** #770; sin cambios en la factory CRUD #638 ni data lifecycle #658.

## Contrato disponible (tras merge; no se afirma deployment)

| Request (autenticada bajo /api/v1/exports) | Permiso server-side | Proyección | Formatos |
| --- | --- | --- | --- |
| GET `/masters/clients?format=json&take=100&skip=0` | `clients.manage` | rif, name, contact, email, phone, address, fiscalType, active | CSV, JSON |
| GET `/masters/suppliers?format=csv&take=100&skip=0` | `purchases.manage` | rif, name, contact, email, phone, address, retentionProfile, active | CSV, JSON |
| GET `/masters/products?format=json&take=100&skip=0` | `inventory.manage` | sku, name, description, unit, cost, price, minStock, taxRate, active | CSV, JSON |

**Reglas del contrato:** `format=json|csv`, `take=1..500`, `skip=0..1000000`, entrada estricta sin parámetros desconocidos. El tenant proviene exclusivamente de `req.context.tenantId`; sin contexto autenticado el endpoint falla. Cada consulta usa `where:{tenantId:ctx.tenantId}` y orden estable por clave de negocio e id. El resultado incorpora hash SHA-256 de bytes emitidos, número de filas y `x-cg-next-skip` si existe otra página. Cuerpo JSON `schemaVersion:1` con `source:'contagest:server'`, `exportedAt`, `entity`, `skip/take/hasMore` y registros allowlisted. CSV utiliza quoting RFC4180 y prefijo contra spreadsheet formula injection. Los Decimal se convierten mediante `toString()`, sin float.

**Seguridad:** `cache-control:no-store` y `nosniff`; sin exportar `id`, `tenantId`, campos de auditoría, flags de sistema, `qrPayload` ni datos clínicos. Sólo se exponen campos permitidos; las exportaciones que incluyen datos de contacto exigen permisos del dominio. No se admiten solicitudes genéricas de tabla/campo ni cambios en estados financieros. La auditoría `data.export.master` se inserta en la misma transacción de lectura: si falla el audit insert, no se entrega contenido. La auditoría almacena únicamente entidad, formato, ventana, cantidad, hash y timestamp (no los datos exportados).

**Límites reales:** la paginación `skip/take` es determinista para un conjunto sin cambios, **no** es un snapshot multi-página ante mutaciones concurrentes. No se afirma export completo o atomic snapshot si cambia la tabla durante varias páginas. La protección de datos sensibles impide incluir `stock` como saldo contable derivado o documentos financieros emitidos sin workflow adicional.

## Evidencia y gates

- Helper `backend/src/modules/exports/master-export.ts` con proyección fija, CSV seguro y SHA-256.
- Regresiones `tests/master_export_v770.test.mjs`, ejecutables con `node --experimental-strip-types --test tests/master_export_v770.test.mjs`; se integraron al `test:xlsx` del backend existente, **sin** desactivar ni reducir ningún check obligatorio.
- Sandbox sin DNS hacia github.com: no es posible `git clone` del repo completo ni `npm ci` aquí. Un espejo local del helper fue contrastado con el SHA de blob GitHub y ejecutó 10/10 aserciones focalizadas Node 22.16.0. Esa evidencia **no** reemplaza el test oficial del repo ni su typecheck/build.
- Ejecución obligatoria en checkout real para cerrar incremento: `npm ci`, `npm run typecheck`, `npm --workspace backend run test:xlsx`, `npm test`, `npm run build`, negativos PostgreSQL 17 efímero tenant A→B/B→A y smoke HTTP de los tres endpoints.
- Playwright Chromium/Firefox/WebKit se activa cuando exista cliente UI real para estos endpoints; no se elimina la cobertura existente. No realizar llamadas a bases productivas.

## Seguimiento de pendientes con condición de cierre

| Ref | Estado actual | Resolver por / condición |
| --- | --- | --- |
| **PORT-770-E2E** | NOT EXECUTED | #770: PG17 efímero, fixture aislada de dos tenants y usuarios con permisos negativos, probar HTTP 200/401/403, export del otro tenant invisible, audit fail-closed, límites, refresh, empty/error |
| **PORT-770-SOURCE** | NOT EXECUTED para repo integral | Ejecutar en runner con DNS repo y deps instaladas: lint, typecheck, Node suite, build sobre SHA final y reevaluar ante nuevos commits |
| **PORT-770-UI** | OUT OF SCOPE de este incremento | #770: selección de entidad/formato, loading/empty/error, descarga, keyboard, responsive, estados light/dark, Playwright |
| **PORT-770-IMPORT** | PARTIAL ya existente | #770: CSV/XLSX/JSON upload parser, mapping versionado, control de encoding/locale/decimal, dedupe y checkpoint, compensaciones reversibles sin modificar ledger |
| **PORT-770-EXPORT** | PARTIAL | #770: snapshot consistente multi-página, filtros/versiones/mapeos y operaciones de export completas con proveniencia por documento, privacidad/salud conforme RBAC |
| **PORT-770-CI** | PENDING/BLOCKED si cuota de GitHub Actions | Revisar runs/artifacts del HEAD exacto; quota/provider se registra aparte de fallos de código. Sin desactivar workflows ni required checks |

## Rollback y cierre

Revertir los archivos de #770 y la entrada al script `test:xlsx`; no existe migración ni cambio de almacenamiento. **Este incremento no declara #770 DONE**: faltan carga de archivos CSV/XLSX, importación ampliada, compensación/rollback, frontend y DB/HTTP/Playwright E2E real. Mantener abierto hasta cumplir DoD, o dividir trabajo residual en owners explícitos aprobados sin perder la autoridad.
