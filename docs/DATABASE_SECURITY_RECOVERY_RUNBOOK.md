# Runbook de seguridad de base de datos y recuperación — ContaGest VE

Estado: diseño operativo para Issue #24.  
Ámbito: backend ContaGest, PostgreSQL/Supabase, Vercel serverless, backup lógico externo y recuperación.

## 1. Objetivo

Reducir el blast radius ante robo de credenciales, SQLi futura, error humano, corrupción lógica o ransomware mediante cuatro barreras independientes:

1. credencial runtime sin privilegios DDL/owner;
2. credenciales separadas para migración, backup y monitoreo;
3. backup cifrado fuera del proveedor/proyecto primario;
4. restauración ensayada y alertas de cambios masivos/sensibles.

Ninguna de estas barreras sustituye RBAC, validación, RLS, auditoría de aplicación o revisión de código.

## 2. Matriz de roles

| Rol | Uso | Escritura de negocio | DDL | TRUNCATE | BYPASSRLS | service_role |
|---|---|---:|---:|---:|---:|---:|
| `contagest_runtime` | API/backend | Sí: SELECT/INSERT/UPDATE/DELETE solo tablas Prisma ContaGest | No | No | No | No |
| `contagest_backup` | `pg_dump` | No | No | No | No | No |
| `contagest_monitor` | métricas/auditoría | No; solo INSERT/UPDATE del snapshot privado del monitor | No | No | No | No |
| credencial DDL/owner | Prisma migrations y provisioning | Sí | Sí | Sí | puede tenerlo | no debe llegar al runtime |

El proyecto Supabase contiene tablas de otros productos. `provision-security-roles.sql` limita los grants de runtime/backup a tablas `public` con nombres PascalCase, que es el contrato de las tablas Prisma/ContaGest. No se concede acceso a tablas auxiliares `lower_snake_case`, `auth`, `storage` ni otros esquemas.

## 3. Separación de conexiones

### Runtime Vercel

Variable obligatoria: `DATABASE_RUNTIME_URL`.

Para Vercel/serverless usar transaction pooler, puerto `6543`, con el usuario del rol dedicado y el identificador del proyecto en el formato del pooler. El backend rechaza en producción:

- ausencia de `DATABASE_RUNTIME_URL`;
- `postgres`, `service_role` y roles administrativos conocidos;
- un usuario distinto a `DATABASE_RUNTIME_EXPECTED_ROLE`;
- conexión directa en Vercel;
- Supavisor transaction mode fuera de 6543.

No existe fallback automático a `DATABASE_URL` en producción. El fallo es deliberadamente fail-closed.

### Migraciones/DDL

`DIRECT_DATABASE_URL` debe existir únicamente en el entorno de migración autorizado. Usar conexión directa para Prisma migrate/provisioning. No copiar esta credencial a Vercel runtime.

### Backup

`DATABASE_BACKUP_URL` usa `contagest_backup`. Preferir conexión directa para `pg_dump`; si el ejecutor no dispone de IPv6, puede utilizarse el pooler en session mode 5432 después de comprobar compatibilidad. El script rechaza transaction mode 6543 para `pg_dump`.

### Monitor

`DATABASE_MONITOR_URL` usa `contagest_monitor`. Este rol lee `pg_stat_user_tables`, metadatos mínimos de roles y `AuditLog`, y actualiza exclusivamente `private.contagest_security_metric_snapshot`.

## 4. Orden de activación: obligatorio antes del despliegue estricto

El cambio de runtime es deliberadamente incompatible con seguir usando `postgres` en producción. El orden seguro es:

1. Crear un backup nativo/manual previo al cambio.
2. Generar tres passwords aleatorios independientes en un gestor de secretos.
3. Inyectarlos temporalmente como `CONTAGEST_RUNTIME_PASSWORD`, `CONTAGEST_BACKUP_PASSWORD` y `CONTAGEST_MONITOR_PASSWORD` en una estación/runner administrativo seguro.
4. Ejecutar por conexión directa:

```bash
psql "$DIRECT_DATABASE_URL" -f ops/database/provision-security-roles.sql
psql "$DIRECT_DATABASE_URL" -f ops/database/verify-security-roles.sql
```

5. Probar cada credencial con `select current_user` sin imprimir passwords.
6. Configurar `DATABASE_RUNTIME_URL` y `DATABASE_RUNTIME_EXPECTED_ROLE=contagest_runtime` en Vercel Production antes de promover el despliegue que contiene el fail-closed.
7. Configurar secretos de GitHub para backup/restore/monitor.
8. Ejecutar manualmente `monitor`, luego `backup`, luego `restore` mediante `workflow_dispatch`.
9. Verificar que el restore drill termina correctamente en la base desechable.
10. Activar la variable de repositorio `DB_SECURITY_OPERATIONS_ENABLED=true`.
11. Solo después retirar del runtime cualquier credencial owner histórica y rotarla si estuvo expuesta al entorno de aplicación.

Si los pasos 4–9 no están completados, la automatización se considera **PREPARADA pero NO ACTIVADA**.

## 5. Secretos requeridos en GitHub Actions

No se guardan valores en el repositorio.

- `DATABASE_BACKUP_URL`
- `DATABASE_MONITOR_URL`
- `BACKUP_AGE_RECIPIENT`
- `BACKUP_AGE_IDENTITY_B64`
- `RCLONE_CONFIG_B64`
- `RCLONE_REMOTE`
- `SECURITY_ALERT_WEBHOOK_URL` (recomendado)

Variables no secretas:

- `DB_SECURITY_OPERATIONS_ENABLED=true`
- `DB_MASS_CHANGE_ROW_THRESHOLD=500` como baseline inicial; ajustar tras observar carga real.

La identidad privada `age` debe tener copia de emergencia fuera de GitHub. Perderla implica perder la capacidad de descifrar los backups externos.

## 6. Política de backup externo

`ops/backup/backup-postgres.sh`:

- exige el rol `contagest_backup`;
- rechaza backup sin cifrado;
- produce `pg_dump` custom comprimido;
- valida el archive con `pg_restore --list`;
- cifra con `age`;
- calcula SHA-256;
- sube dump cifrado, checksum y manifest mediante `rclone`;
- verifica que los tres objetos aparecen en el remoto;
- nunca ejecuta borrado remoto.

El remote debe pertenecer a un proveedor o cuenta independiente del proyecto primario. Ejemplos compatibles con rclone: Cloudflare R2, Backblaze B2, S3 en una cuenta separada u otro object storage independiente.

### Requisitos del bucket externo

- versioning habilitado;
- object lock/immutability cuando el proveedor lo permita;
- credencial del job sin permiso `DeleteObject` si el proveedor lo soporta;
- MFA/2FA en la cuenta del proveedor;
- lifecycle configurado en el bucket, no en el script origen;
- alertas de cambios de política/retención.

La automatización local no debe tener capacidad de borrar el histórico remoto. Esa separación es una defensa central anti-ransomware.

## 7. Backup nativo Supabase y PITR

La política externa complementa, no sustituye, los backups del proveedor.

En planes Supabase Pro los backups diarios conservan los últimos 7 días. PITR es un add-on para Pro/Team/Enterprise y ofrece granularidad mucho menor que 24 horas; al habilitar PITR sustituye el mecanismo de daily backups. La decisión de activarlo debe basarse en:

- RPO aceptable del negocio;
- RTO observado en drills;
- volumen de transacciones y costo de reconstrucción;
- MRR/impacto económico de perder horas de datos;
- costo del add-on/compute requerido.

Baseline mientras no exista PITR: backup lógico externo diario, por lo que el RPO lógico objetivo máximo es aproximadamente 24 horas. El RTO **no se inventa**: se mide y registra en cada restore drill.

Nota: los backups de base de datos no restauran los objetos binarios de Supabase Storage; solo su metadata. Si ContaGest almacena archivos críticos en Storage, requiere una política de copia de objetos separada.

## 8. Restore drill mensual

Workflow: `.github/workflows/db-security-operations.yml`, operación `restore`.

Procedimiento automatizado:

1. descargar desde el remote externo el backup más reciente;
2. verificar SHA-256;
3. descifrar con la identidad `age` separada;
4. validar el archive;
5. crear PostgreSQL 17 desechable en el runner;
6. restaurar únicamente allí;
7. confirmar presencia de tablas críticas;
8. contar entidades críticas para evidencia;
9. registrar duración en logs del job.

`restore-drill.sh` se niega a restaurar si la base no termina en `_restore` o `_drill`. También puede bloquear el host primario mediante `PRIMARY_DATABASE_HOST`.

Nunca usar el restore drill contra producción.

## 9. Alertas de DELETE/UPDATE masivos

El monitor consulta `pg_stat_user_tables` y guarda el último contador en `private.contagest_security_metric_snapshot`.

Cada hora compara los deltas por tabla Prisma. Si `UPDATE` o `DELETE` supera `DB_MASS_CHANGE_ROW_THRESHOLD`, genera finding `mass-table-change`.

Ventajas frente a leer solo `pg_stat_statements`:

- mide cambios entre ejecuciones;
- no re-alerta indefinidamente por una consulta histórica;
- detecta cambios aunque la sentencia cambie de forma;
- un reset de estadísticas se convierte en nuevo baseline, no en falso positivo.

Limitación: es detección por tabla y ventana, no atribución forense de cada sentencia. Para atribución profunda se deben conservar logs externos/SIEM y valorar `pgaudit` en una fase posterior.

## 10. Alertas de roles y licencias

El monitor revisa eventos recientes de `AuditLog` asociados a:

- `LicenseKey`;
- `LicenseActivation`;
- `Role`;
- `RolePermission`;
- `Permission`;
- `UserRole`;
- acciones cuyo nombre indique cambio de licencia/rol/permiso.

Además verifica cada hora que los tres roles DB dedicados no hayan adquirido:

- SUPERUSER;
- CREATEDB;
- CREATEROLE;
- REPLICATION;
- BYPASSRLS;
- membresía de `service_role`.

Con `SECURITY_ALERT_WEBHOOK_URL` se envía un JSON sin passwords ni strings de conexión. Sin webhook, el job falla para que GitHub Actions actúe como señal de alerta.

## 11. Runbook de incidente

### A. Sospecha de robo de credencial runtime

1. Declarar incidente y conservar hora/evidencia.
2. Deshabilitar temporalmente escrituras si existe riesgo activo.
3. Rotar inmediatamente password de `contagest_runtime` desde canal DDL seguro.
4. Actualizar `DATABASE_RUNTIME_URL` en Vercel y redeploy.
5. Invalidar deployments/entornos antiguos que conservaban el secreto.
6. Revisar `AuditLog`, contadores DML, logs de runtime y conexiones activas.
7. Verificar privilegios con `verify-security-roles.sql`.
8. Si hubo alteración de datos, pasar al procedimiento de restauración.

No es necesario rotar la credencial DDL si nunca estuvo en el runtime y no hay evidencia de compromiso, pero debe revisarse como parte del incidente.

### B. Sospecha de compromiso de credencial DDL/owner

Severidad crítica.

1. detener migraciones y accesos administrativos;
2. rotar la credencial owner/DDL;
3. revisar creación/modificación de roles, extensiones, funciones SECURITY DEFINER, policies y grants;
4. rotar también runtime/backup/monitor porque un owner comprometido pudo leer o reemplazar su configuración;
5. comparar esquema contra migraciones versionadas;
6. ejecutar Supabase Security Advisor;
7. restaurar a entorno aislado antes de cualquier cutover si hay evidencia de manipulación.

### C. Borrado accidental o ransomware

1. detener escrituras para evitar ampliar la pérdida;
2. capturar hora aproximada de la última operación válida;
3. preservar la base afectada para análisis; no restaurar encima de inmediato;
4. seleccionar backup/PITR anterior al incidente;
5. restaurar primero a una base/proyecto aislado;
6. ejecutar smoke tests, conteos, integridad referencial, RLS y Security Advisor;
7. comparar transacciones posteriores recuperables;
8. aprobar cutover con evidencia;
9. rotar secretos antes de volver a abrir escrituras;
10. documentar RPO/RTO reales y postmortem.

## 12. Recuperación de secretos

Orden recomendado de rotación ante incidente amplio:

1. credencial DDL/owner;
2. `contagest_runtime`;
3. `contagest_backup`;
4. `contagest_monitor`;
5. secretos JWT/licenciamiento de backend si existe posibilidad de acceso al entorno;
6. Supabase service role si estuvo disponible en el mismo entorno comprometido;
7. credenciales del bucket externo si hay evidencia de compromiso de CI.

No reutilizar passwords entre roles.

## 13. Riesgo residual: aislamiento tenant

El rol `contagest_runtime` elimina owner/service_role/BYPASSRLS/DDL/TRUNCATE y limita el alcance a tablas Prisma. Eso reduce de forma material el daño posible ante robo de la credencial.

Sin embargo, el backend actual autentica y resuelve el tenant en la capa Express/Prisma. Sus consultas no ejecutan cada request dentro de una transacción PostgreSQL con un tenant GUC/claim que pueda reutilizar las policies `authenticated` basadas en `auth.uid()`.

Por ello las policies del rol backend permiten el acceso requerido a las tablas Prisma y **no deben presentarse como aislamiento tenant de base de datos completo**. El aislamiento tenant efectivo sigue dependiendo también de:

- JWT/cookies firmados;
- `requestContext`/`requireTenant`;
- RBAC;
- filtros `tenantId` de repositorios/queries;
- pruebas de aislamiento.

Implementar RLS backend por request con contexto transaccional sería un hardening arquitectónico adicional y debe diseñarse teniendo en cuenta que Supavisor transaction mode no conserva estado de sesión entre transacciones.

## 14. Rollback del hardening

El código fail-closed puede revertirse, pero **no se recomienda volver a usar owner como operación normal**.

Si una rotación produce outage:

1. mantener producción cerrada antes que degradar silenciosamente a owner;
2. corregir/probar `contagest_runtime` por pooler;
3. si es imprescindible un break-glass, documentar quién/por qué/cuánto tiempo y rotar inmediatamente después;
4. nunca almacenar la credencial break-glass en frontend o repositorio.

Los roles y policies pueden revocarse explícitamente después de retirar el deployment que los usa. No borrarlos durante un incidente hasta preservar evidencia.

## 15. Definition of Done operativa

Issue #24 solo puede considerarse completamente operativo cuando exista evidencia de:

- roles creados y `verify-security-roles.sql` PASS;
- Vercel ejecutando como `contagest_runtime`;
- un backup externo cifrado verificado;
- un restore drill externo → PostgreSQL desechable PASS;
- monitor ejecutado al menos una vez y baseline creado;
- calendario diario/mensual/hora habilitado;
- responsables y canal de alertas definidos.

El merge del código por sí solo deja la capacidad **implementada**, pero la activación de infraestructura requiere los secretos y proveedor externo que no deben versionarse.
