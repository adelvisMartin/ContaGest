# ContaGest #761 — Tarifas horarias por proyecto (versiones inmutables)

**Estado:** implementación funcional bajo una bandera OFF por defecto. No supone autorización para facturar ni aprobación contable. El ticket #761 continúa abierto.

## Rutas seguras

Ambas heredan `requireTenant`, la sesión/licencia vigente, `modules.manage` y la bandera **`CONTAGEST_PROJECTS_V761_ENABLE` desactivada por defecto**; sin `true` responderán HTTP 503.

- `POST /api/v1/modules/projects/:projectId/rate-cards`: cuerpo estricto `{"memberId":"<UUID>","hourlyRateExact":"100.25","currency":"USD","effectiveFromUtc":"2026-11-01T00:00:00.000Z","expectedRevision":0}`. Escribe **versión 1**. Para crear la versión N+1, el cliente solicita `expectedRevision:N` y una vigencia posterior a N. No se permite editar, borrar ni aplicar un tipo retroactivo sobre la versión previa.
- `GET /api/v1/modules/projects/:projectId/rate-cards/:memberId?take=50&skip=0`: historial privado, paginado y verificado de versiones por trabajador (máximo 100 por página). No devuelve facturas ni acceso de lectura para otros trabajadores.

La autoridad real del servidor exige proyecto **activo** del mismo tenant, `Project.managerId` igual al usuario autenticado con `UserProfile.active`, cliente activo, trabajador activo y una tarea existente asignada a ese trabajador dentro de ese mismo proyecto. Los identificadores de tenant y responsable no se admiten en JSON del usuario. Sólo el **responsable activo del proyecto** crea/consulta tarifas, incluso si otro usuario tiene `modules.manage`.

## Versionado, precisión y transacciones

La tabla existente `ModuleRecord` almacena filas de namespace privado `project-rate-card-v761`, sin exponer ese namespace al CRUD genérico. Cada identificador está derivado de `(tenant, project, member, revision)` con hash determinista en formato UUID, para que dos solicitudes de la **misma versión** no puedan crear dos documentos. La versión siguiente requiere que la versión anterior exista y sea válida, y una fecha de vigencia UTC **estrictamente posterior**. Las versiones son inmutables desde esta ruta.

`hourlyRateExact` se almacena como **cadena decimal positiva de dos posiciones**, no como flotante; `currency` es una etiqueta de tres mayúsculas y **no** demuestra por sí sola autorización ISO 4217, tipo de cambio vigente ni moneda fiscal habilitada para el cliente. Una eventual factura debe consultar la política contable central y capturar la versión efectiva en la operación de aprobación. Nunca facturar desde la cotización de esta ruta por sí sola.

La inserción y su `AuditLog` mínimo comparten transacción Prisma `Serializable`. Un fallo de auditoría revierte la tarifa; unicidad `P2002` o serialización `P2034` produce conflicto HTTP 409. Sólo se insertan nuevas versiones, nunca se modifica una tarifa ya asignada a un trabajo histórico. La respuesta incluye explícitamente `invoiceAuthorized:false` y `billableAuthorized:false`. No hay impuesto, descuento, contabilidad, `SalesInvoice`, FX ni posting automáticos.

## Evidencia, QA y límite de despliegue

Archivo `backend/src/modules/projects/project-rate-card-store.ts`, suite versionada `tests/project_rate_card_contract_v761.test.mjs`:

```sh
node --experimental-strip-types --test tests/project_rate_card_contract_v761.test.mjs
# Prueba aislada TS con Node types:
tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --types node backend/src/modules/projects/project-rate-card-store.ts
```

Localmente se ejecutaron **9/9 pruebas versionadas** y **15/15 pruebas ampliadas de desarrollo**, con Node v22.16.0; TypeScript global v5.8.3 estricto pasó. La suite versionada y el archivo de servicio coinciden por hash Git con los archivos realmente probados. No equivale a full `npm ci`/build, PG17/Prisma real o navegador. Tests de Postgres pendientes: tenant A/B, tareas asignadas, doble versión bajo dos sesiones paralelas, serialización e integridad auditada; verificar escalabilidad JSONB. También faltan HTTP/CSRF/licencia y UI.

**Riesgos residuales:** el almacenamiento JSON privado es provisional y carece de constraints FK/índices versionados propios. El cálculo de exactitud monetaria `prepareProjectTimeRateSnapshotIntent` de #761 permanece como propuesta sin aprobación financiera ni snapshot persistido. La próxima implementación debe conectar la tarifa elegida y su revisión con la aprobación real de `TimeEntry`, resolviendo el período efectivo, la política de redondeo/impuestos y la generación idempotente de un **borrador SalesInvoice** a través del motor financiero existente.

**NO-GO:** no activar `CONTAGEST_PROJECTS_V761_ENABLE=true` ni marcar el ticket #761 completado hasta tener evidencia PostgreSQL/HTTP/browser del SHA exacto y el circuito contable aceptado. Rollback de rutas/servicio/test/documento sin borrar automáticamente los `ModuleRecord`/auditorías ya existentes; preservar/exportar datos antes de retirarlos.
