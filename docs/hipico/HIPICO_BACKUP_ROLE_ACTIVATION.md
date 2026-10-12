# Activación manual de hipico_backup

Este runbook activa el rol PostgreSQL dedicado usado por los flujos Hípico de backup/restore. No se ejecuta desde GitHub Actions y no aplica migraciones de producto.

## Contrato de seguridad

hipico_backup debe quedar con LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION y NOBYPASSRLS.
También debe tener CONNECT al database objetivo, USAGE en public sin CREATE, y SELECT únicamente sobre el inventario canónico de ops/backup/hipico-public-tables.txt.
No debe tener INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ni TRIGGER, ni grants fuera del inventario, ni acceso efectivo al schema auth, ni membership de service_role.
El password nunca se versiona ni se imprime deliberadamente.

## Fases

### PRE_ROLLOUT

Úsala antes del rollout de schema. El inventario sigue siendo de 25 tablas, pero se conceden y verifican sólo las tablas canónicas que ya existen. Las tablas futuras quedan deferred por el verifier v24.

### STEADY_STATE

Úsala después de completar el rollout. En esta fase deben existir las 25/25 tablas y el rol debe poder leer exactamente las 25, sin grants adicionales.

## Precondiciones

1. Trabajar sobre el candidate SHA que se pretende respaldar.
2. Tener acceso DDL/owner directo al PostgreSQL objetivo.
3. Obtener el password de hipico_backup desde un secret manager, nunca desde Git ni chat/logs.
4. Confirmar que no existe otro proceso de provisión/rotación del mismo rol en curso.
5. Ejecutar desde la raíz del repositorio.

## Activación PRE_ROLLOUT

Ejecuta manualmente:

    export HIPICO_BACKUP_DDL_URL='postgresql://<owner>@<host>/<db>'
    export HIPICO_BACKUP_ROLE_MODE='PRE_ROLLOUT'
    read -s HIPICO_BACKUP_PASSWORD
    export HIPICO_BACKUP_PASSWORD
    bash ops/database/provision-hipico-backup-role.sh

El wrapper ejecuta ops/database/provision-hipico-backup-role.sql. El SQL consume ops/backup/hipico-public-tables.txt; la lista de tablas no se duplica en el provisionador.

## Verificación obligatoria antes de secrets

Primero ejecuta la verificación SQL manual con credencial DDL:

    export HIPICO_BACKUP_ROLE_MODE='PRE_ROLLOUT'
    psql "$HIPICO_BACKUP_DDL_URL" -v ON_ERROR_STOP=1 -f ops/database/verify-hipico-backup-role.sql

Después verifica usando la conexión runtime real del rol dedicado:

    export HIPICO_CANDIDATE_SHA="$(git rev-parse HEAD)"
    export HIPICO_BACKUP_DATABASE_URL='postgresql://hipico_backup:<secret>@<host>/<db>'
    export HIPICO_BACKUP_ROLE_MODE='PRE_ROLLOUT'
    export HIPICO_BACKUP_ROLE_REPORT="artifacts/qa/hipico-backup-role/${HIPICO_CANDIDATE_SHA}.json"
    node scripts/hipico-backup-role-verify-v24.mjs

No habilites ni cargues los secrets de backup en GitHub hasta obtener PASS del verifier v24 sobre el SHA exacto. Un estado FAIL o NOT_EXECUTED bloquea backup/change-control.


## Puerta obligatoria antes del backup real (#842)

El script `ops/backup/hipico-backup-postgres.sh` ahora exige **antes de consultar producción, crear archivos o cifrar datos**:

1. El checkout tiene el SHA exacto de `HIPICO_CANDIDATE_SHA` y pasa `scripts/hipico-exact-sha-gate.mjs`.
2. La conexión `HIPICO_BACKUP_DATABASE_URL` pasa el verificador canónico v24 para el modo indicado. Se comprueban NOINHERIT/NOBYPASSRLS, pertenencia de roles, privilegios, alcance y ausencia de acceso a `auth`; no basta con consultar cuatro flags de `pg_roles`.
3. La única identidad permitida para backup runtime es `hipico_backup`. La variable antigua `HIPICO_BACKUP_EXPECTED_ROLE` no puede autorizar otra identidad.

Para la certificación final del estado de producción debe usarse `HIPICO_BACKUP_MODE=STEADY_STATE`; el modo `PRE_ROLLOUT` sirve exclusivamente para despliegues graduales y no demuestra 25/25 tablas. No guardar DSN, destinatarios `age` ni secretos en issues o artefactos. Ejecutar backup cifrado + transferencia off-site con destino autorizado y posteriormente `ops/backup/hipico-restore-drill.sh` sobre PG17 local desechable. El PASS exige conteos, integridad referencial, hash de inventario y tiempos RPO/RTO reales asociados al candidate.

La existencia de los scripts y sus pruebas de regresión **no certifica** que el rol esté activado en producción ni que un backup remoto haya sido restaurado. Sin esas operaciones #842 continúa `NOT_EXECUTED/BLOCKED_INFRASTRUCTURE`.

## Después del rollout: STEADY_STATE

Cuando las migraciones canónicas ya hayan creado las 25 tablas:

    export HIPICO_BACKUP_ROLE_MODE='STEADY_STATE'
    bash ops/database/provision-hipico-backup-role.sh
    psql "$HIPICO_BACKUP_DDL_URL" -v ON_ERROR_STOP=1 -f ops/database/verify-hipico-backup-role.sql
    export HIPICO_BACKUP_ROLE_MODE='STEADY_STATE'
    node scripts/hipico-backup-role-verify-v24.mjs

STEADY_STATE debe demostrar 25/25. Una tabla ausente, un grant cross-scope, INHERIT, BYPASSRLS, membership de service_role, acceso a auth o cualquier privilegio mutable es fallo.

## Rollback manual

No hagas rollback mientras exista un backup en curso. Primero confirma que no hay ejecución activa de backup/restore/change-control usando hipico_backup.

Con una conexión DDL/owner, revoca CONNECT, privilegios de schema public, privilegios de tablas/secuencias/funciones y elimina las policies hipico_backup_read_all. Después ejecuta:

    DROP ROLE hipico_backup;

Si DROP ROLE hipico_backup falla por objetos o grants residuales, no uses CASCADE a ciegas. Inspecciona y revoca sólo las dependencias del rol.

## Evidencia esperada

El verifier Node produce hipico-backup-role-verification.v24 ligado al candidate SHA. Para habilitar los flujos de backup/change-control se requiere status PASS, mode correcto, 25 entradas esperadas, cero findings, cero cross-scope grants, cero mutable privileges, NOINHERIT, NOBYPASSRLS, sin acceso a auth y sin membership de service_role.

La existencia de este runbook o del SQL no significa que el rol esté activo en producción. La activación sólo queda demostrada por evidencia ejecutada contra el target.
