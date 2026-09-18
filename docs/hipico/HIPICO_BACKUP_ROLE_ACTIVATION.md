# Activación manual de hipico_backup

Este runbook activa el rol PostgreSQL de backup de Control Hípico. Es un procedimiento **manual** y no debe ejecutarse desde GitHub Actions ni desde el runtime de la aplicación.

## Precondiciones

- Candidate SHA identificado y aprobado.
- Acceso DDL directo mediante `HIPICO_BACKUP_DDL_URL`.
- Password nuevo suministrado por secret manager en `HIPICO_BACKUP_PASSWORD`.
- Inventario canónico disponible en `ops/backup/hipico-public-tables.txt`.
- Ningún backup de Control Hípico en curso.

No copies URLs con credenciales, passwords, tokens, service_role ni material de Supabase Auth en logs, issues o artifacts.

## 1. Seleccionar fase

Antes del rollout de schema:

```bash
export HIPICO_BACKUP_ROLE_MODE=PRE_ROLLOUT
```

Después de un rollout exitoso y verificación post-deploy:

```bash
export HIPICO_BACKUP_ROLE_MODE=STEADY_STATE
```

PRE_ROLLOUT concede SELECT sólo sobre las tablas canónicas que existen actualmente. STEADY_STATE exige que las 25 tablas existan.

## 2. Provisionar manualmente

Carga fuera del repositorio:

- `HIPICO_BACKUP_DDL_URL`
- `HIPICO_BACKUP_PASSWORD`

Luego ejecuta:

```bash
bash ops/database/provision-hipico-backup-role.sh
```

El baseline SQL aplica:

- LOGIN;
- NOINHERIT;
- NOSUPERUSER;
- NOCREATEDB;
- NOCREATEROLE;
- NOREPLICATION;
- NOBYPASSRLS;
- CONNECT al DB actual;
- USAGE en public;
- CREATE en public denegado;
- todos los grants previos del rol revocados antes de re-grantar el scope Hípico;
- sin membership service_role;
- sin USAGE ni grants explícitos sobre el schema auth.

El shell consume el inventario versionado y concede únicamente SELECT sobre las tablas Hípico aplicables a la fase.

## 3. Verificar antes de habilitar secrets de backup

No configures ni habilites `HIPICO_BACKUP_DATABASE_URL` para el workflow de backup hasta que el verificador produzca PASS.

Ejecuta el workflow **Hípico Backup Role Verify v24** con:

- candidate SHA exacto;
- PRE_ROLLOUT antes de migrar;
- STEADY_STATE después de completar el schema.

También puede ejecutarse localmente con una credencial de verificación:

```bash
HIPICO_CANDIDATE_SHA=<sha> \
HIPICO_BACKUP_ROLE_MODE=PRE_ROLLOUT \
HIPICO_BACKUP_DATABASE_URL=<secret> \
node scripts/hipico-backup-role-verify-v24.mjs
```

PASS requiere, entre otros controles:

- NOINHERIT;
- NOBYPASSRLS;
- no service_role;
- no acceso a auth;
- sin privilegios mutables;
- sin grants public fuera del inventario;
- policies de lectura correctas cuando RLS está habilitado.

## 4. Ejecutar backup/restore

Sólo después de PASS del rol:

1. configura los secrets age/rclone/backup;
2. ejecuta el workflow de backup/restore en PRE_ROLLOUT;
3. exige evidence PASS y restoreVerified=true;
4. ejecuta schema change-control;
5. aplica las migraciones únicamente mediante el procedimiento manual aprobado;
6. ejecuta post-deploy read-only;
7. reprovisiona/verifica el rol en STEADY_STATE;
8. ejecuta un nuevo backup/restore STEADY_STATE.

## Rollback

No hagas rollback del rol mientras haya un backup running / backup en curso.

Si la activación debe revertirse:

1. confirma que no existe ningún backup o restore en curso;
2. deshabilita primero los secrets/workflows que usan `HIPICO_BACKUP_DATABASE_URL`;
3. revoca CONNECT/USAGE y los SELECT del rol;
4. revoca cualquier policy `hipico_backup_read_all` sólo después de verificar que no se usa;
5. rota el password;
6. conserva el rol deshabilitado temporalmente si se necesita auditoría;
7. elimina el rol únicamente tras comprobar que no posee objetos ni participa en procesos activos.

Nunca sustituyas este rol por owner, postgres o service_role para “desbloquear” un backup.
