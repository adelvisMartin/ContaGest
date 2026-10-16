# #849 · Service steps: contrato de prevalidación (incremento parcial)

**Alcance:** `backend/src/modules/service-catalog/service-step-plan.policy.ts` y `tests/service_step_plan_v849.test.mjs`. No crea tablas, rutas, cambios sobre Product o reservas, ni modifica precios, impuestos, contabilidad, entitlements o expedientes clínicos.

## Characterization (main, 2026-10-16)

- `backend/prisma/schema.prisma`: `Product` es la autoridad comercial de SKU/stock/costo/precio/impuesto, `BusinessLocation` representa sedes y `Employee` representa personal. No existe todavía un `model Service` canónico en el esquema inspeccionado.
- `backend/src/modules/pricing/pricing.service.ts`: `resolveCanonicalPrice(targetType='service')` falla deliberadamente con `PRICE_SERVICE_AUTHORITY_UNAVAILABLE` hasta que #849 provea una identidad tenant-scoped verificada. **No** saltar este gate ni cargar precios a `ServiceStep`.
- `backend/src/modules/business-locations/business-locations.routes.ts`: la identidad y pertenencia de sedes se comprueban desde el tenant servidor. Scheduling (#848) conserva la decisión de disponibilidad/asignación; #852 conserva consumos y derechos de beneficios.

## Contrato limitado de este incremento

Un adaptador backend *ya autorizado* entrega IDs de tenant y servicio, versión y pasos. La función pura valida scope, IDs/labels, posiciones únicas contiguas 1..N, duración entera positiva, gaps y límites. Ordena determinísticamente, deriva la duración total y devuelve una vista inmutable `previewOnly`, sin copiar campos de precio, datos clínicos, saldo ni asignaciones de recursos. **No autoriza por sí sola** IDs procedentes del cliente y no garantiza persistencia/snapshot histórico: la futura Service authority debe verificar referencias reales del tenant, serializar reordenamiento en PostgreSQL 17, versionar snapshots usados por bookings, añadir RBAC y endpoints admin/public, y probar compatibilidad con Product/#856, Staff/Location/#857, #848 y #852.

`node --experimental-strip-types --test tests/service_step_plan_v849.test.mjs` cubre entradas positivas y negativas, reordenamiento, cross-tenant, duplicados, huecos, límites, campos financieros/clínicos desconocidos, inmutabilidad y versión. El módulo no requiere credenciales ni acceso a la base de datos. El DoD de #849 **no** se cumple con este incremento.
