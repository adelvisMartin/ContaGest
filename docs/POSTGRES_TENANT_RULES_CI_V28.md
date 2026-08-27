# PostgreSQL real en CI — Issue #28

## Objetivo

Demostrar en cada cambio crítico de persistencia que el historial completo de migraciones de ContaGest puede reconstruirse desde cero y que las reglas v11.15 existen físicamente en PostgreSQL, no sólo en mocks o validaciones TypeScript.

## Entorno

El workflow `.github/workflows/postgres-tenant-rules-v28.yml` levanta `postgres:17-alpine` con la base `contagest_rules_e2e`.

No utiliza:

- Supabase remoto;
- secretos de producción;
- Vercel;
- datos compartidos;
- tablas de Control Hípico o Budget Wallet.

`ops/database/prepare-supabase-ephemeral.sql` crea únicamente los roles/schema/functions mínimos que el historial de migraciones espera de Supabase. Ese helper ya rechaza bases que no sean `_e2e`, `_drill` o `_restore`.

## Método canónico de migración

El workflow ejecuta:

```bash
npm --workspace backend run prisma:deploy
npx prisma migrate status --schema backend/prisma/schema.prisma
```

El log completo se conserva como artefacto.

## Reglas verificadas

`qa/postgres-tenant-rules-v28.sql` usa PostgreSQL real y comprueba:

1. **RIF inmutable**: `UPDATE Tenant.rif` debe producir `tenant_rif_immutable` / SQLSTATE `23514`.
2. **maxTenants**: una suscripción con `maxTenants=1` acepta el primer tenant y rechaza un segundo RIF con `subscription_tenant_limit_reached`.
3. **maxUsers**: una suscripción con `maxUsers=1` acepta la primera licencia/email y rechaza un segundo usuario distinto con `subscription_user_limit_reached`.
4. **Binding licencia/tenant**: una `LicenseKey` ligada a la suscripción no puede emitirse para un tenant fuera de `SubscriptionTenant`; PostgreSQL debe responder `subscription_not_entitled_for_tenant`.
5. **Legal privado y versionado**:
   - `LegalAcceptance` y `CookiePreference` tienen RLS activo;
   - `anon` y `authenticated` no poseen SELECT directo;
   - dos versiones distintas del mismo documento pueden coexistir;
   - el duplicado exacto de la misma evidencia es rechazado por el unique constraint.

Todas las fixtures se crean dentro de una sola transacción y el test termina con `ROLLBACK`. Una comprobación posterior falla el gate si queda cualquier fila `qa28-*`.

## Seguridad operacional

`scripts/run-postgres-tenant-rules-v28.sh` aplica defensa en profundidad:

- exige `DATABASE_URL`;
- consulta el nombre real de la DB;
- rechaza cualquier DB que no termine en `_e2e`;
- permite proteger adicionalmente un host mediante `PRIMARY_DATABASE_HOST`;
- ejecuta `psql -X -v ON_ERROR_STOP=1`.

## Evidencia

El artefacto `evidencia-postgresql-v28` conserva durante 14 días:

- `prerequisitos-v28.log`;
- `migration-v28.log`;
- `tenant-rules-v28.log`;
- `db-inventory-v28.log`.

El inventario final registra versión de PostgreSQL, migraciones aplicadas, triggers críticos y estado RLS legal.

## Branch protection

El job que debe convertirse en requerido para `main` es:

`PostgreSQL #28 · reglas anti-tenant reales / Migraciones + constraints v11.15`

La existencia del workflow no implica por sí sola que GitHub Branch Protection lo haya marcado como required. Esa configuración debe verificarse aparte en las reglas del repositorio. No se debe afirmar que es obligatorio hasta comprobar esa política.

## QA local

Con una base PostgreSQL desechable cuyo nombre termine `_e2e`:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/database/prepare-supabase-ephemeral.sql
npm --workspace backend run prisma:deploy
node --test tests/postgres_tenant_rules_issue_28.test.mjs
bash scripts/run-postgres-tenant-rules-v28.sh
```

## Rollback

Este ticket no modifica constraints productivos: prueba las reglas ya existentes y agrega infraestructura CI. El rollback consiste en revertir el workflow, test SQL, runner y documentación. No hay migración de rollback ni cambio de datos productivos asociado.
