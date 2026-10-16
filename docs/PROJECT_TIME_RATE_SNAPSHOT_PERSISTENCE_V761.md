# ContaGest #761 · Snapshot persistente de tarifa horaria aprobada

Este incremento **captura la tarifa horaria inmutable** correspondiente a un registro de tiempo aprobado, sin permitir su facturación ni contabilización. Se reutiliza el namespace privado de `ModuleRecord`, la revisión de horas de #1106, las RateCards inmutables #1114 y el selector de vigencia #1118. No hay DDL ni motor contable paralelo.

## API y autorización

`POST /api/v1/modules/projects/:projectId/tasks/:taskId/time-entries/:entryId/rate-snapshot`

Body estricto: `{"expectedRevision":2}` (la revisión que realmente tiene la hora aprobada). Se aplica `requireTenant`, sesión/cookie CSRF, licencia y permiso `modules.manage`; adicionalmente el servidor exige que el actor sea el **responsable activo del proyecto, diferente del trabajador y quien aprobó la hora**. El proyecto debe estar activo, tarea asignada y en curso o terminada, cliente y perfiles activos en el mismo tenant. No se recibe tarifa, moneda, usuario, empresa ni rateCardId en JSON del navegador.

Se consulta la hora aprobada por tenant, proyecto, tarea y revisión, y el historial inmutable de RateCards del trabajador hasta 1.025 filas para evitar lectura silenciosamente truncada. El selector valida fechas efectivas, revisiones y moneda de todas las tarifas, y rechaza un cambio de tarifa en medio del intervalo. Una `Serializable` inserta una fila con namespace `project-time-rate-snapshot-v761` y un `AuditLog` mínimo en **la misma transacción**; una falla de auditoría revierte el insert.

El snapshot tiene clave determinista derivada de **tenant + entryId**, de modo que dos intentos del mismo registro colisionan con la PK: segundo intento => conflicto 409, sin duplicar. También se rechaza P2034 de serialización y revisiones incorrectas. Se guardan tarifa exacta decimal de dos posiciones como string, moneda, revisión/versionado de RateCard, relación con el registro aprobado y metadatos de auditoría. No se permite sobrescritura ni DELETE por la API.

## Bloqueos monetarios y de despliegue

**NO** se genera prorrateo, redondeo fiscal, impuesto, factura, SalesInvoice, asiento, cobro ni vínculo contable. El snapshot permanece `billableAuthorized:false`, `invoiceAuthorized:false`, `linkedInvoiceId:null`, y las horas aprobadas permanecen `billable:false`. La selección no autoriza a facturar: se requieren regla Decimal aprobada y vinculación idempotente al motor financiero existente en incrementos posteriores.

Las rutas heredan `CONTAGEST_PROJECTS_V761_ENABLE` **OFF por defecto**; sin `true` responde HTTP 503. **NO activar producción** por el merge.

## Pruebas y límites

`tests/project_time_rate_snapshot_store_v761.test.mjs` contiene doce pruebas: autorización y segregación, aislamiento de tenant, proyecto/tarea/miembro, fecha efectiva, rollback por auditoría, dos intentos que colisionan, serialización y rechazo de entradas inválidas. Se ejecutó en Node22.16 usando la fuente TS compilada **y dependencias simuladas aisladas**, con stubs que verifican los contratos de serializadores, incluyendo el ID determinista de tarifa. Este test prueba lógica del nuevo servicio, pero **no sustituye el comportamiento real** de Prisma o del selector/serializadores completos en el monorepo.

```sh
# Desde un checkout completo con dependencias instaladas:
cd backend
npx tsx --test ../tests/project_time_rate_snapshot_store_v761.test.mjs
```

**NOT_EXECUTED en este entorno**: ese comando de checkout completo, `npm ci`, typecheck completo, PG17 RLS con tenants A/B, JSONB filter, carrera SERIALIZABLE con snapshots concurrentes, auditoría real, cookies/licencia/CSRF, Chrome/PWA, Playwright y despliegue. Los checks en cola no son PASS y no se deben desactivar gates obligatorios. `#761` sigue abierto por las reglas monetarias, integración `SalesInvoice`, reportes/UI y QA restante.

Rollback: revertir el nuevo servicio/ruta/test/documentación; **preservar** cualquier snapshot y auditoría ya escritos, exportarlos o migrarlos explícitamente antes de descontinuar su namespace. Nunca borrar datos de usuario automáticamente.
