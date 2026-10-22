# #849 — Proyección pública de catálogo (incremento de seguridad)

Fecha: 2026-10-22. Baseline: PR #1282.

El módulo `service-public-projection.mjs` consume únicamente filas **seleccionadas explícitamente por un repositorio de catálogo tenant-scoped**, nunca un JSON del navegador. Rechaza registros duplicados, cruzados entre tenants, filas huecas, versiones/duraciones inválidas y campos prohibidos (costos, precios, impuestos, derechos, notas clínicas, contactos y auditoría). Sólo emite servicios `active + public` con `id/categoryId/name/description/modality/durationMinutes/version` y orden estable. La disponibilidad pertenece a #848 y el precio/impuesto a Product/price-book. 

**No es un endpoint público, un modelo Prisma ni una fuente de datos persistidos.** Este contrato no certifica aislamiento PostgreSQL: debe conectarse a un repositorio autorizado, agregar modelos normalizados de Category/Service/Steps/Eligibility staff/location/resource y versionado histórico, y ejecutar PG17/API/browser/cross-tenant negativos. Las proyecciones no deben dar acceso a datos de un tenant por elegir `tenantId` en query.

Tests: `node --test tests/service_public_projection_v849.test.mjs` (negativos de seguridad, filtro público y orden).

## Versionado real de elegibilidad staff/location (2026-10-22)

Una alta/baja efectiva en capacidades de profesional o elegibilidad de sede incrementa `ServiceDefinition.version` **en la misma transacción**, guarda `ServiceDefinitionRevision.snapshot` con `staff[]` y `locations[]` ordenados por ID y registra auditoría; reintentos idempotentes sin cambio no producen nuevas revisiones. La baja de referencias inactivas sigue permitida dentro del tenant; las altas exigen refs activas. Estas revisiones protegen la interpretación del catálogo histórico, aunque **un booking sólo queda protegido cuando #848 guarde su propio snapshot/version**.
