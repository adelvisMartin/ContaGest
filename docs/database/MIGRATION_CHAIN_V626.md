# #626 · Full Migration Chain — PostgreSQL 17

## Autoridad

La autoridad de migraciones de ContaGest sigue siendo `backend/prisma/migrations/**`. Este gate no crea una segunda historia ni reescribe migraciones ya integradas. Su objetivo es demostrar que la cadena versionada converge de forma reproducible sobre PostgreSQL 17 tanto desde cero como desde límites de upgrade soportados.

El manifiesto machine-readable vive en `config/migration-chain-v626.json` y el runner único es `backend/scripts/migration-chain-v626.mjs`.

## Regla de inmutabilidad

Las migraciones históricas ya integradas **no se reescriben** para conseguir verde. En particular, `20260927152000_data_lifecycle_v562/migration.sql` conserva el contrato histórico que declaró referencias de tenant como UUID aunque `Tenant.id` canónico es TEXT.

Para pruebas locales/CI sobre bases desechables, `migration-compat-v626.mjs` proyecta exclusivamente esa frontera `tenantId/p_tenant UUID -> TEXT` dentro de una transacción. El archivo histórico permanece byte-for-byte fuera del scope de modificación. La proyección sólo está habilitada cuando el nombre de la base cumple `(_e2e|_drill|_restore)$`; cualquier convergencia real de producción pertenece a #627.

La proyección fail-closed exige que:

- `public."Tenant"."id"` exista y sea `text`;
- la autoridad lifecycle no esté parcialmente materializada;
- el SQL histórico conserve las firmas esperadas que se proyectan;
- `20260927152000_data_lifecycle_v562` siga siendo la migración terminal mientras esta compatibilidad sea necesaria.

Un cambio posterior que rompa cualquiera de esas premisas devuelve un error estable y obliga a revisar el plan en vez de ocultar drift.

## Prerrequisitos locales

- Node.js 22 y `npm ci`/lockfile del repositorio;
- PostgreSQL 17 real;
- cliente `psql` disponible en PATH;
- una base aislada y descartable cuyo nombre termine en `_e2e`, `_drill` o `_restore`;
- `DATABASE_URL` y `DIRECT_DATABASE_URL` apuntando únicamente a esa base.

Nunca ejecutar estos comandos contra una base compartida, staging reutilizado o producción.

## Comandos

Desde la raíz del repositorio:

```bash
npm run migration:test:from-zero
npm run migration:test:upgrade
npm run migration:manifest
```

`migration:test:from-zero` elimina únicamente los schemas de una base reconocida como efímera, instala el bootstrap histórico/Supabase-compatible, aplica la cadena canónica y valida columnas críticas.

`migration:test:upgrade` genera primero el manifest de referencia from-zero y luego repite la convergencia desde cada snapshot versionado. El schema físico final —columnas y foreign keys de `public`, excluyendo `_prisma_migrations`— debe producir el mismo SHA-256. Puede limitarse a un snapshot con `npm --workspace backend run migration:test:upgrade -- --from=<id>`.

`migration:manifest` inspecciona el estado físico actual y escribe evidencia determinista en `artifacts/migration-chain-v626/`.

## Snapshots soportados

Los límites se declaran en `config/migration-chain-v626.json`; no contienen dumps, filas productivas, PII ni secretos. Son límites de la propia historia versionada:

1. `pre-ledger-hardening`: antes de #91;
2. `pre-fx-fiscal-data-lifecycle`: antes de la ola FX/Fiscal/Lifecycle del 2026-09-27;
3. `production-audit-2026-09-29`: aproximación estructural sintética del gap auditado, sin copiar datos de producción.

Todo snapshot requiere `id`, migration boundary existente y provenance explícita. De lo contrario el runner falla con `SNAPSHOT_PROVENANCE_INVALID`.

## Errores estables

El gate usa, entre otros:

- `MIGRATION_APPLY_FAILED`;
- `MIGRATION_ORDER_INVALID`;
- `MIGRATION_DUPLICATE_AUTHORITY`;
- `MIGRATION_TYPE_MISMATCH`;
- `UPGRADE_DIVERGENCE`;
- `FROM_ZERO_SCHEMA_MISMATCH`;
- `MISSING_PREREQUISITE`;
- `UNSAFE_PRODUCTION_COMMAND`;
- `SNAPSHOT_PROVENANCE_INVALID`.

Los errores son evidencia; no deben convertirse en warnings ni `continue-on-error` para fabricar verde.

## PostgreSQL 17 / CI

`.github/workflows/migration-chain-v626.yml` ejecuta el mismo runner con `postgres:17-alpine`, contrato estático, from-zero, los upgrades soportados, manifest, Prisma validate/generate, typecheck, auditoría de autoridad DB/raw SQL y build backend. Un run remoto sólo cuenta como evidencia del SHA exacto que lo produjo.

## Producción y #627

#626 demuestra la cadena local/aislada. **No aplica DDL ni DML a Supabase productivo.** El inventario/drift de #625 se consume como evidencia read-only y cualquier `preflight -> migrate -> verify -> recovery` de producción pertenece exclusivamente a #627.

## Rollback

El cambio de #626 sólo añade runner/manifest/workflow y compatibilidad efímera. Para revertirlo se revierte su commit/PR. No existe rollback de datos productivos porque este ticket no los modifica. La historia SQL previa permanece intacta.
