# #626 · Full Migration Chain — PostgreSQL 17

## Autoridad

La autoridad de schema de aplicación continúa siendo `backend/prisma/schema.prisma` + `backend/prisma/migrations/**`, gobernada por `config/database-authority-67-75.json`. El runner de este ticket **no crea una autoridad paralela**: ejecuta primero `scripts/database-authority-audit-v6775.mjs`, reconstruye el baseline SQL histórico declarado por el repositorio y aplica, en orden lexicográfico canónico, cada `migration.sql` versionado.

Las migraciones históricas `0001_init`, `0003_accounting_hr_fiscal_hardening`, `0004_analytics_qr_barcode` y `0005_food_orders_notifications_ai_demo` son deltas sobre el baseline SQL-first v8.5. El bootstrap `ops/database/prepare-supabase-ephemeral.sql` existe sólo para PostgreSQL efímero y reproduce los stubs mínimos de Supabase/Auth/Storage y los baselines históricos necesarios. Producción Supabase no se usa en este gate.

## Seguridad

El runner acepta únicamente `DATABASE_URL` cuyo nombre termine en `_e2e`, `_drill` o `_restore`. Rechaza explícitamente el project ref productivo `soxzatxiwlfsvtblrqal`. Cada ejecución elimina/recrea sólo schemas de la DB efímera recibida y limpia en `finally`, incluso cuando una migration falla.

Nunca use este runner con una URL compartida o productiva. No ejecuta `db push`, `migrate reset` ni DDL contra Supabase productivo.

## Comandos

Con PostgreSQL 17 real y una DB aislada, por ejemplo `contagest_migrations_e2e`:

```powershell
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/contagest_migrations_e2e'
npm run migration:test:from-zero
npm run migration:test:upgrade
npm run migration:test:upgrade -- --from pre-ledger-hardening
npm run migration:manifest
npm run test:migration-chain:contract
npm run test:migration-chain:postgres
```

`migration:test:from-zero` reconstruye el baseline, aplica la cadena completa, valida los contratos críticos y genera `artifacts/database/migration-chain/from-zero.json`.

`migration:test:upgrade` primero obtiene el contrato físico from-zero y después reconstruye cada snapshot soportado, aplica únicamente las migrations restantes y exige el mismo `schemaSha256` final. El timestamp del reporte no forma parte del hash físico.

## Snapshots soportados

`config/migration-chain-snapshots.json` contiene sólo metadata versionada, boundary y fixtures sintéticos:

- `pre-ledger-hardening`: antes de posting/reversal/period gates del ledger.
- `pre-fx-fiscal-data-lifecycle`: antes de FX, autoridad fiscal y data lifecycle recientes.
- `production-audit-nearest-2026-09-29`: aproximación canónica reproducible más cercana al estado auditado de producción, sin copiar filas, PII, secretos ni objetos gestionados por Supabase.

Cada snapshot incluye `createdFromRepoSha`, `lastMigration`, fixture y `provenanceSha256`. Cualquier cambio manual de esa provenance falla como `SNAPSHOT_PROVENANCE_INVALID`.

## Catálogo de errores

El runner emite códigos estables: `MIGRATION_APPLY_FAILED`, `MIGRATION_ORDER_INVALID`, `MIGRATION_DUPLICATE_AUTHORITY`, `MIGRATION_TYPE_MISMATCH`, `UPGRADE_DIVERGENCE`, `FROM_ZERO_SCHEMA_MISMATCH`, `MISSING_PREREQUISITE`, `UNSAFE_PRODUCTION_COMMAND` y `SNAPSHOT_PROVENANCE_INVALID`.

La pareja `20260927143000_fiscal_authority_v561` / `20260927143000_fiscal_engine_v561` comparte timestamp de forma explícitamente allowlisted: `fiscal_authority` posee el DDL y `fiscal_engine` conserva compatibilidad histórica como no-op. Cualquier otra colisión de timestamp falla cerrada.

## Cobertura crítica

El gate verifica físicamente Ledger (`postedAt`, `postedBy`, `reversalOfId`), tablas FX, autoridad fiscal, `RolePermission` y que todas las FK `tenantId` de data lifecycle sean `TEXT`, igual que `Tenant.id`. La fixture inválida demuestra rollback atómico: si la migration falla, el objeto creado antes del error no puede sobrevivir.

## Reparación de `data_lifecycle_v562`

El baseline `main@ccebefa9c05e0ad81609c09300a6c32c1bb8a1eb` fallaba sobre PostgreSQL 17 con `SQLSTATE 42804`: `DataRetentionPolicyVersion.tenantId uuid` intentaba referenciar `Tenant.id text`. La auditoría #625 y el historial read-only de Supabase demostraron que `20260927152000_data_lifecycle_v562` no estaba desplegada en producción. Por eso #626 corrige ese migration file candidato antes de su primer despliegue; no se reescribe una migration productiva aplicada.

Una migration que ya figure aplicada en una autoridad soportada se considera inmutable. Las correcciones posteriores deben ser forward-only y documentar preflight/recovery.

## Añadir una migration

1. Añadir un directorio con nombre canónico único y `migration.sql`.
2. No reutilizar timestamps ni ownership físico; si existe una excepción histórica, debe quedar allowlisted y documentada.
3. Ejecutar `npm run audit:database-authority` y `npm run audit:raw-sql-security`.
4. Ejecutar `npm run test:migration-chain:contract`.
5. Ejecutar PostgreSQL 17 real: from-zero, todos los snapshots y rollback fixture.
6. Ejecutar Prisma validate/generate y backend typecheck/build cuando corresponda.
7. Revisar el manifest/hash físico antes de mergear.

## Supabase vs PostgreSQL local

Roles, funciones `auth.*`, Storage y otros objetos gestionados por Supabase son compatibilidad de plataforma y no autoridad de aplicación. El bootstrap local sólo crea la superficie mínima requerida para replay. Divergencias de plataforma deben clasificarse mediante #625 y nunca resolverse borrando objetos productivos por comparación ingenua.
