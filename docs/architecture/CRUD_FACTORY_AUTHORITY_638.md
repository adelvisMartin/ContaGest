# #638 — CRUD factory: ownership, allowlist y seguridad tenant

**Estado del incremento:** `IMPLEMENTED_IN_PR / LOCAL_POLICY_TESTED / FULL_INTEGRATION_NOT_VERIFIED`  
**Baseline:** `main@5523608b3ca7f98727d043902ae7d47dd09880c5` (cambió desde `b6483997...` durante reconocimiento).  
**Owner exclusivo:** `ChatGPT-ContaGest-CRUD-hardening-20261015-w6`.  
**Contrato primario:** [AGENTS.md](../../AGENTS.md), issue #638, `backend/src/modules/crud.factory.ts`, `backend/src/modules/crud-policy.ts`.

## Contexto

Antes del cambio, el manifiesto registraba cinco delegados Prisma como `model:'...' as any`. La factory usaba `(prisma as any)[model]`, creaba/actualizaba usando esquemas Zod que no siempre eran `strict`, y ejecutaba update/delete usando sólo `where: { id }` después de una lectura filtrada por tenant. El `tenantId` del contexto se sobrescribía al crear, pero la mutación final carecía de predicado tenant.

Eso permitía dependencias implícitas de una frontera de autorización sin tipo ni allowlist explícita y dejaba una ventana entre lectura/autorización y escritura. El objetivo es fallar cerrado, **sin** duplicar el servicio de dominio ni los verificadores de identidad/RBAC/RLS.

## Nueva autoridad por modelo

| Modelo delegado | Escritura genérica permitida | No permitido desde CRUD |
|---|---|---|
| `client` | RIF sólo en creación; en actualización nombre, contacto, email, teléfono, dirección, fiscalType y active | id, tenantId, timestamps, relaciones/roles |
| `supplier` | RIF sólo en creación; en actualización nombre, contacto, email, teléfono, dirección, retentionProfile y active | id, tenantId, timestamps, relaciones |
| `product` | sku, nombre, descripción, unidad, cost, price, minStock, taxRate, active | stock, reserved, tenant, movimientos, QR/sistema |
| `bankAccount` | bankName, accountNo y currency sólo al crear; en actualización bankName y active | balance, movimientos, delete genérico |
| `taxPeriod` | create con `period` | status, ivaDebit, ivaCredit, igtfPaid, update y delete genéricos |

RIF de cliente/proveedor, número de cuenta y moneda bancaria son identificadores estables: su corrección requiere flujo de dominio auditado, no PUT genérico.\n\nLa política de campos reside en `crud-policy.ts` y los esquemas Zod en `schemas.ts`. Ambas puertas deben cumplirse. Los cambios monetarios, fiscalidad, cierre/reapertura, saldo y stock requieren comandos especializados con permisos, idempotencia y auditable transaction en sus owners (#637 / #629 / #628). El status 405 para las operaciones fiscales/banqueras no significa que el producto haya dejado de necesitarlas: significa que no pueden escribirse por un endpoint genérico.

## Invariantes de la implementación

1. Lista cerrada de cinco Prisma delegates; no se admite un `keyof prisma` arbitrario ni se toma un modelo del request.
2. Operaciones `POST/PUT`: verificar campos **antes** del parsing Zod estricto; campos desconocidos, `id`, `tenantId`, timestamps, balances y efectos de dominio → `422` sin repetir valores atacantes.
3. `POST` crea con `tenantId` de sesión firmado al final de los datos autorizados.
4. `GET(id)`, `PUT(id)` y `DELETE(id)` filtran por **`{ id, tenantId }`**; la escritura también queda condicionada atómicamente al tenant, no sólo la lectura previa.
5. `GET /` impone filtros/búsqueda por allowlist de modelo, `q` ≤ 160, `take` 1–500, `skip` 0–1,000,000; sort/filter/query arbitrarios se rechazan.
6. Se conservan `requireTenant`, `requirePermission`, `validateBody`, `writeAudit` y el formato `ok`/error centralizado.
7. No se retocaron migraciones, RLS ni datos de producción. No introducir atajos para las restricciones.

## Compatibilidad y revisión necesaria antes del merge

Las respuestas de API siguen usando el envelope `ok`, pero hay cambios deliberados en **errores**: payloads extra → 422, filtros/orden desconocidos → 422 y algunas operaciones financieras → 405. Antes de integrar se deben buscar todos los consumers de esos cinco endpoints y caracterizar CRUD permitido, campos que usan, flujos de fiscalidad/bancos, facturación, importación y baja. Si existe un consumer legítimo que enviaba `status`/montos por `taxPeriod`, moverlo al servicio fiscal autorizado, **no** reabrir la mass-assignment genericamente.

El pre-read de PUT/DELETE más la escritura tenant-scoped protege el alcance ante cambios concurrentes; un error Prisma por carrera debe conservar respuesta segura y auditable. Un audit log que falla silenciosamente merece seguimiento separado en #637/#651; no se declara corregido aquí.

## Matriz de verificación y evidencia requerida

- **LOCAL_POLICY / TypeScript:** `node --test tests/crud_factory_hardening_issue_638.test.mjs` + typecheck real; test usa Node 22 `--experimental-strip-types` para ejecutar directamente `crud-policy.ts` sin reimplementarla.
- **CI:** el runner `scripts/run-authoritative-contracts.mjs` incluye explícitamente este test dentro de `npm run test:contracts:current`; `ci.yml` llama a `npm test`, `npm run typecheck`, `npm run build:backend`.
- **API/PG17 (obligatorio antes del cierre):** dos tenants aislados; CREATE con id/tenantId falseados → 422; valid create cliente/proveedor/producto → 200; PUT ID de tenant B → 404, sin cambio; DELETE ID de tenant B → 404, sin cambio; buscar no filtra otros tenants; replays/backoff; Prisma `update` con predicado compuesto.
- **E2E Playwright:** `qa/crud-factory-security-v638.spec.mjs` ejercita HTTP real, tenant A/B, falsificación de id/tenant, escritura legítima, update/reload y cleanup; exige `CG_CRUD_E2E_ISOLATED=true`, backend `CG_CRUD_E2E_API_BASE_URL` sólo loopback, `CG_CRUD_E2E_TOKEN_A/B` sintéticos y `QA_BASE_URL` local para que Playwright no arranque frontend innecesariamente. Además hay que verificar formularios de los cinco modelos en browser con PG17 efímero. Nunca pruebas destructivas contra producción.
- **REMOTE_CI/DEPLOY:** sólo `PASS` si corre en candidato SHA y sus logs lo prueban. `MERGED` no es prueba.
- **PHYSICAL_EXTERNAL:** QA manual del propietario diferido; conservar `NOT_EXECUTED`.

## Rollback

Revertir en conjunto factory+policy+manifest+contract test+runner en un PR dedicado sólo si se demuestra regresión, conservando los permisos/aislamiento. **No restaurar writes vulnerables de mass-assignment** como solución rápida; preferir compatibilidad mediante servicio especializado. Este cambio no aplica DDL ni require seeding/migración.

## Autoridad cerrada de registro (2026-10-21)

La frontera genérica valida el permiso y entidad de auditoría **por modelo** antes de crear cualquier router. `CRUD_ROUTER_AUTHORITY` hace de contrato runtime para llamadores JavaScript/no tipados; `CrudOptions` usa una unión discriminada ligada a los cinco esquemas Zod y los permisos literales, de modo que asociar `bankAccount` con `clients.manage`, un esquema de otro modelo o una entidad diferente no compile. Se mantiene `requireTenant` / `requirePermission` server-side y el allowlist de payload independiente: no se confía en opciones de registro arbitrarias.

El cambio no modifica ninguna ruta ni nivel de permiso existente ni concede escritura fiscal nueva. Requiere ejecutar el test de contrato #638 y `npm run typecheck` sobre el SHA exacto; los flujos HTTP PostgreSQL17 multi-tenant conservan su condición de validación pendiente hasta una ejecución real. Un merge de código sin esos gates no acredita el DoD operativo.
