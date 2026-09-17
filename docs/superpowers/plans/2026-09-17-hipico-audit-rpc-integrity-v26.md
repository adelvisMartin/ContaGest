# Control Hípico — Audit RPC Integrity v26 Implementation Plan

**Issue:** #361

**Base:** `feat/hipico-mainline-reconciliation-v13@e798e608d8a3e1640aceac757bddec3039fdf08a`

## Goal

Endurecer `public.hipico_append_audit(uuid,text,text,text,jsonb)` sin cambiar su firma pública ni convertir auditoría de cliente en autoridad financiera.

## Security model

- `SECURITY DEFINER` sólo como mecanismo de acceso a una tabla sin INSERT directo de `authenticated`.
- `search_path=pg_catalog` y objetos sensibles calificados por esquema.
- `auth.uid()` y `hipico_profiles.role` son autoridad de identidad/rol.
- Sólo `admin`/`operator` pueden sincronizar mutaciones.
- Cualquier otro rol, actual o futuro, queda denegado por defecto.
- Workspace se resuelve/valida en servidor y siempre pertenece al `auth.uid()`.
- Action/entity usa allowlist exacta derivada del `mutate()` actual de la PWA.
- Payload máximo: 64 KiB; IDs y textos quedan acotados.
- `actorUserId`, `actorRole`, `source`, `authority`, `financialAuthority` y `settlementAuthority` son server-owned.
- PWA = `source=client_sync`, `authority=advisory`, `financialAuthority=false`, `settlementAuthority=false`.
- Filas pre-v26 se preservan como `legacy/legacy`; no se reescribe su significado histórico.
- Inserts directos de servidor posteriores usan defaults `server/authoritative`.
- Idempotency/replay del v13 se conserva sobre el payload canónico.

## TDD / evidence

1. `tests/hipico_v26_audit_rpc_integrity.test.mjs` congela catálogo, privilegios, provenance y firma PWA.
2. `scripts/hipico-audit-rpc-v26-pg.mjs` aplica v25/v26 dentro de una transacción y ejecuta positivos/negativos.
3. El probe cubre anon, viewer, auditor, cross-workspace, action desconocida, entity mismatch, payload sobredimensionado, direct INSERT, metadata falsificada, replay exacto y replay conflictivo.
4. Todo el probe termina con `ROLLBACK`; no persiste datos ni DDL de validación.
5. `.github/workflows/hipico-audit-rpc-v26.yml` liga PostgreSQL 16 y contratos al candidate SHA exacto.

## Rollback

- El cambio de aplicación se revierte mediante el PR/commit sin borrar evidencia histórica.
- Si v26 ya fue aplicada a una DB, no se debe hacer rollback destructivo de columnas. Se reemplaza la función por una versión corregida y se preservan `source/authority` y filas existentes.
- Nunca restaurar INSERT directo de `authenticated` como mecanismo de rollback.

## Acceptance mapping

- viewer/auditor denied → probe PostgreSQL.
- unknown action / entity mismatch denied → allowlist + probe.
- foreign workspace denied → owner scope + probe.
- oversized payload denied → 64 KiB guard + probe.
- actor/role/provenance cannot be forged → canonical server payload + probe.
- PWA same RPC signature → static contract against `supabase.js`.
- historical rows readable → transactional pre-v26 fixture backfilled `legacy/legacy`.
- no fake CI → jobs without runner/steps remain `BLOCKED_INFRASTRUCTURE`.
