# Recuperación del baseline Prisma en PostgreSQL efímero

## Contexto

El historial de Prisma de ContaGest no nació desde una base vacía. Las migraciones versionadas posteriores se escribieron sobre el bootstrap SQL v8.5 que ya contenía las tablas, enums, índices y políticas RLS base.

El helper `ops/database/prepare-supabase-ephemeral.sql` reconstruye ese baseline únicamente en bases cuyo nombre termina en `_e2e`, `_drill` o `_restore`.

## Problema detectado

Cuando GitHub Actions recuperó runners reales, los gates PostgreSQL mostraron dos fallos históricos:

1. sin bootstrap v8.5, `0003_accounting_hr_fiscal_hardening` fallaba porque `Tenant` todavía no existía;
2. después de restaurar el bootstrap v8.5, Prisma respondía `P3005` porque encontraba un schema no vacío sin historial `_prisma_migrations`.

No era correcto modificar migraciones históricas ya desplegadas ni fingir una base vacía.

## Solución

`backend/scripts/prepare-ephemeral-prisma-baseline.mjs` se ejecuta antes de `prisma migrate deploy`.

El resolver:

- no hace nada en bases que no terminen en `_e2e`, `_drill` o `_restore`;
- exige que el baseline esté completo mediante tablas representativas de plataforma, contabilidad, licensing e imports;
- falla cerrado si encuentra un baseline parcial;
- si el baseline completo existe y `0001_init` aún no está registrado, ejecuta `prisma migrate resolve --applied 0001_init`;
- si `0001_init` ya está aplicado, no modifica nada;
- nunca marca migraciones posteriores como aplicadas.

Después, `prisma migrate deploy` conserva autoridad para aplicar todas las migraciones posteriores en orden.

## Límite de producción

El resolver no modifica bases con nombres normales de producción. No auto-resuelve migraciones productivas, no escribe directamente en `_prisma_migrations` y no altera checksums históricos.

## Validación requerida

El cambio sólo se considera verificado cuando una PostgreSQL efímera real demuestra:

1. bootstrap v8.5;
2. baseline `0001_init` registrado;
3. `prisma migrate deploy` completo;
4. `prisma migrate status` sin pendientes;
5. reglas anti-tenant y suites verticales ejecutadas sobre el mismo SHA.

Hasta entonces el estado es PARTIAL.
