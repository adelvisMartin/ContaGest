# Control Hípico — Audit RPC Integrity v26 Implementation Plan

**Issue:** #361

**Base:** `feat/hipico-mainline-reconciliation-v13@e798e608d8a3e1640aceac757bddec3039fdf08a`

## Goal

Endurecer `public.hipico_append_audit(uuid,text,text,text,jsonb)` sin cambiar su firma pública ni convertir auditoría de cliente en autoridad financiera.

## Deployed-state evidence

La inspección read-only del proyecto Supabase activo confirmó que la RPC desplegada:

- es `SECURITY DEFINER`, owner `postgres`;
- usa `search_path=public, pg_temp`;
- deriva actor con `auth.uid()`;
- deriva ownership con `public.hipico_workspace_owner()`;
- deriva rol con `public.hipico_access_role()`;
- permite EXECUTE a `authenticated` y `service_role`;
- no concede INSERT directo de `hipico_audit_events` a `authenticated`;
- aún no tiene `idempotency_key`, `source` ni `authority` en la tabla;
- el acceso desplegado admite `viewer` además de `admin/operator`.

Por eso v26 preserva el modelo delegado real en vez de asumir que `auth.uid()` es siempre el workspace owner.

## Security model

- `SECURITY DEFINER` sólo como capability boundary hacia una tabla sin INSERT directo de `authenticated`.
- `search_path=pg_catalog` y objetos sensibles calificados por esquema.
- `auth.uid()` es actor autenticado.
- `hipico_workspace_owner()` es autoridad server-side de ownership delegado.
- `hipico_access_role()` es autoridad server-side del rol.
- Sólo `admin`/`operator` pueden sincronizar mutaciones; `viewer` y cualquier otro rol actual/futuro quedan denegados por defecto.
- Workspace se resuelve/valida en servidor y siempre pertenece al workspace owner derivado.
- Action/entity usa allowlist exacta derivada de los 28 pares `mutate()` actuales de la PWA.
- Payload máximo: 64 KiB; IDs y textos quedan acotados.
- `actorUserId`, `actorRole`, `source`, `authority`, `financialAuthority` y `settlementAuthority` son server-owned.
- PWA = `source=client_sync`, `authority=advisory`, `financialAuthority=false`, `settlementAuthority=false`.
- Filas pre-v26 se preservan como `legacy/legacy`; no se reescribe su significado histórico.
- Inserts directos de servidor posteriores usan defaults `server/authoritative`.
- v26 crea `idempotency_key` + índice único si el entorno desplegado aún no recibió el hardening v13, preservando replay safety ante migration drift.
- El owner de la fila es el workspace owner; el actor del payload es el usuario autenticado delegado.

## TDD / evidence

1. `tests/hipico_v26_audit_rpc_integrity.test.mjs` congela catálogo, privilegios, provenance, ownership delegado, idempotencia y firma PWA.
2. `scripts/hipico-audit-rpc-v26-pg.mjs` aplica v25/v26 dentro de una transacción y ejecuta positivos/negativos.
3. El probe reproduce usuario operador distinto del workspace owner y cubre anon, viewer, auditor/future-role, cross-workspace, action desconocida, entity mismatch, payload sobredimensionado, direct INSERT, metadata falsificada, replay exacto y replay conflictivo.
4. Todo el probe termina con `ROLLBACK`; no persiste datos ni DDL de validación.
5. `.github/workflows/hipico-audit-rpc-v26.yml` liga PostgreSQL 16 y contratos al candidate SHA exacto.
6. El proyecto Supabase real se mantiene read-only durante esta implementación; no se ejecuta DDL de prueba contra producción.

## Rollback

- El cambio de aplicación se revierte mediante el PR/commit sin borrar evidencia histórica.
- Si v26 ya fue aplicada a una DB, no se debe hacer rollback destructivo de columnas. Se reemplaza la función por una versión corregida y se preservan `idempotency_key`, `source/authority` y filas existentes.
- Nunca restaurar INSERT directo de `authenticated` como mecanismo de rollback.

## Acceptance mapping

- viewer/auditor denied → probe PostgreSQL con helpers de acceso delegado.
- unknown action / entity mismatch denied → allowlist exacta + probe.
- foreign workspace denied → workspace-owner scope + probe.
- oversized payload denied → 64 KiB guard + probe.
- actor/role/provenance cannot be forged → canonical server payload + probe.
- delegated operator preserved → `owner_id=workspace owner`, `actorUserId=operator`.
- PWA same RPC signature → static contract against `supabase.js`.
- historical rows readable → transactional pre-v26 fixture backfilled `legacy/legacy`.
- migration drift safe → `idempotency_key`/index are additive `IF NOT EXISTS`/replay-safe.
- no fake CI → jobs without runner/steps remain `BLOCKED_INFRASTRUCTURE`.
