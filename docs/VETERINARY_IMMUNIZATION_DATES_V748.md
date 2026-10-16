# #748 · Fechas de inmunización veterinaria (incremento acotado)

## Estado previo

La API `POST /api/v1/verticals/health/immunizations`, registrada en `health-measurements.routes.ts`, valida animal y profesional por `tenantId` pero su schema aceptaba timestamps como strings arbitrarios. La UI `VeterinaryPreventiveCarePanel` envía timestamps ISO mediante `toISOString()`; `administeredAt` puede omitirse para default de PostgreSQL, `nextDueAt` puede ser `null`.

## Comportamiento propuesto

`health.schemas.ts` valida con `immunizationDateIssues` antes de la query existente:

- `administeredAt` y `nextDueAt`, cuando están presentes, deben ser timestamps ISO 8601 con offset explícito, como `2026-10-15T12:00:00Z` o `2026-10-15T08:00:00-04:00`.
- Se rechazan fechas imposibles, horas/offsets fuera de rango y `nextDueAt` menor o igual a `administeredAt`, comparando instantes absolutos.
- Omitir `administeredAt` y usar `nextDueAt=null` continúa admitido. No se comprueba que la dosis próxima sea futura: se permiten registros históricos. No se impone política médica de intervalos ni inventa schedule.
- El schema rechaza las entradas antes de las consultas SQL; la ruta, permisos, persistencia, response y las vacunaciones históricas no se modifican. No se altera inventory.

## Riesgos y evidencia

El contrato de los dos campos se endurece: otros consumidores que enviaban fechas sin zona deberán migrar a ISO 8601 con offset. El consumidor UI canónico ya usa UTC explícito, pero falta characterization HTTP real para clientes externos.

Comandos focalizados en Node 22: `node --experimental-strip-types --test tests/veterinary_immunization_dates_v748.test.mjs`, `node --experimental-strip-types --check backend/src/modules/verticals/veterinary-immunization-date-policy.ts`, más typecheck, build y API/browser sobre PostgreSQL 17 aislado del SHA actual **a ejecutar antes de fusionar**.

**No constituye cierre de #748**: pendiente idempotencia/stock inventoryLot, snapshots y expiración, certificados, reminders/outbox, guardian RBAC y pruebas tenant A/B e integración. `SOURCE_REUSE=NONE`. No se deben desactivar checks para declarar verde.
