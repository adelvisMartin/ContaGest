# Runbook de migración · Control Hípico v1.13 RC2

Estado: **PREPARADO / NO APLICADO EN PRODUCCIÓN**.

Este documento cubre `hipico_v13_workspace_sync_security.sql` y `hipico_v13_lab_channel_bootstrap.sql`. La aplicación real requiere respaldo verificado, prueba en una base aislada, evidencia de RLS y autorización explícita del propietario.

## Dependencias y orden

1. `hipico_v12_operations.sql`
2. `hipico_v12_shadow_validation.sql`
3. `hipico_v13_workspace_sync_security.sql`
4. `hipico_v13_lab_channel_bootstrap.sql`

La primera migración v1.13 introduce workspace/profile/auditoría owner-scoped y endurece permisos de tablas operativas. La segunda configura un único canal LAB activo para el deployment personal actual de Control Hípico.

El bootstrap LAB no es un diseño multi-tenant genérico: selecciona el workspace más recientemente actualizado y fuerza un único `control-hipico-lab` activo global. No reutilizar este contrato para módulos multiempresa de ContaGest.

## Preflight obligatorio

Antes de cualquier ejecución:

- confirmar entorno y `project_ref`; nunca deducirlo por nombre;
- exportar esquema/datos de las tablas `hipico_*` afectadas;
- registrar recuentos de filas por `owner_id` y `group_key`;
- comprobar que no existan dos LAB activos;
- comprobar firmas actuales de funciones `hipico_*`;
- conservar el SHA exacto del commit de la migración;
- mantener Bridge y LAB en modo sin envío durante el cambio.

Consultas solo lectura sugeridas:

```sql
select current_database(), current_user, now();

select group_key, channel_type, status, count(*)
from public.hipico_bot_channels
where group_key = 'control-hipico-lab'
group by group_key, channel_type, status;

select owner_id, count(*)
from public.hipico_bot_channels
group by owner_id
order by count(*) desc;
```

## Respaldo mínimo

Usar primero backup/PITR del proveedor y además un dump lógico cifrado fuera de Git:

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --file="hipico-pre-v13-$(date -u +%Y%m%dT%H%M%SZ).dump" \
  --table='public.hipico_*'
```

## QA en entorno aislado

Aplicar primero en rama Supabase/Postgres local/base efímera que contenga el esquema previo. Ejecutar scripts dos veces para validar idempotencia.

```sql
begin;
\i supabase/sql/hipico_v13_workspace_sync_security.sql
\i supabase/sql/hipico_v13_lab_channel_bootstrap.sql
-- verificaciones
rollback;
```

Después repetir con `commit` únicamente en QA.

## Matriz RLS obligatoria

Usar dos usuarios/owners de QA A y B; no usar `service_role` para las pruebas negativas.

- A lee/actualiza únicamente su workspace/profile.
- B no lee ni modifica filas de A.
- `hipico_append_audit` rechaza un `workspace_id` ajeno.
- `authenticated` no inserta/actualiza/elimina directamente `hipico_outbox` ni `hipico_ledger_entries`.
- RPC v1.13 reportan `SECURITY INVOKER` (`prosecdef=false`).
- `anon` no ejecuta RPC ni accede a tablas protegidas.
- existe exactamente un LAB activo esperado.

Introspección:

```sql
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename like 'hipico_%'
order by tablename, policyname;

select n.nspname as schema_name, p.proname, p.prosecdef as security_definer,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'hipico_%'
order by p.proname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name like 'hipico_%'
order by table_name, grantee, privilege_type;
```

## Aplicación en producción

Solo tras QA y autorización explícita:

1. confirmar backup/PITR y dump;
2. mantener `HIPICO_LAB_SEND_ENABLED=false`;
3. ejecutar workspace security;
4. validar policies/grants/functions;
5. ejecutar bootstrap LAB;
6. confirmar exactamente un LAB;
7. comprobar `/bridge/health` con token autorizado;
8. validar PWA/APK en lectura y sync;
9. observar errores/outbox antes de cerrar ventana.

## Rollback

No usar `DROP TABLE` improvisado. Orden:

1. kill switch: detener Bridge y mantener LAB send off;
2. rollback de código al SHA anterior;
3. restaurar grants/policies previos desde script revisado;
4. usar PITR/dump si existe corrupción o aislamiento incorrecto.

No borrar workspace/auditoría para “volver atrás” sin preservar datos.

## Evidencia de salida

Registrar SHA, entorno/fecha, doble ejecución idempotente, matriz A/B, `pg_policies`, `prosecdef`, grants, recuentos antes/después, referencia de backup sin credenciales, health del Bridge y riesgo residual.

Hasta completar esa evidencia: **READY FOR ISOLATED QA / BLOCKED FOR PRODUCTION MIGRATION**.
