# Checklist de activación operativa — Issue #24

Este archivo evita confundir **código mergeado** con **hardening activo en producción**.

## A. Antes de desplegar el cambio fail-closed

- [ ] Crear/rotar passwords independientes para `contagest_runtime`, `contagest_backup` y `contagest_monitor` en un gestor de secretos.
- [ ] Ejecutar `ops/database/provision-security-roles.sql` con la conexión DDL directa.
- [ ] Ejecutar `ops/database/verify-security-roles.sql` y conservar evidencia PASS.
- [ ] Probar `select current_user` con las tres URLs dedicadas.
- [ ] Configurar en Vercel Production `DATABASE_RUNTIME_URL` usando `contagest_runtime` por transaction pooler 6543.
- [ ] Confirmar `DATABASE_RUNTIME_EXPECTED_ROLE=contagest_runtime`.
- [ ] Retirar del runtime Vercel cualquier URL owner/DDL que ya no sea necesaria.

## B. Backup externo

- [ ] Crear bucket en proveedor/cuenta independiente del Supabase primario.
- [ ] Habilitar versioning.
- [ ] Habilitar Object Lock/immutability cuando esté disponible.
- [ ] Crear credencial rclone sin permiso de borrado remoto cuando el proveedor lo permita.
- [ ] Generar keypair `age`; guardar la identidad privada también en escrow offline.
- [ ] Configurar secretos GitHub: `DATABASE_BACKUP_URL`, `BACKUP_AGE_RECIPIENT`, `BACKUP_AGE_IDENTITY_B64`, `RCLONE_CONFIG_B64`, `RCLONE_REMOTE`.
- [ ] Ejecutar manualmente workflow `Seguridad DB y recuperación` → `backup`.
- [ ] Verificar dump cifrado + SHA-256 + manifest + inventario de tablas en el proveedor externo.

## C. Restore drill

- [ ] Ejecutar manualmente workflow → `restore`.
- [ ] Confirmar reconstrucción de schema desde `schemaRevision`.
- [ ] Confirmar SHA-256 del backup y del inventario de tablas.
- [ ] Confirmar restauración en `contagest_drill`, nunca en producción.
- [ ] Registrar duración real del drill como RTO observado.

## D. Monitoreo

- [ ] Configurar `DATABASE_MONITOR_URL` con `contagest_monitor`.
- [ ] Configurar `SECURITY_ALERT_WEBHOOK_URL` o aceptar explícitamente alertas mediante fallo del job.
- [ ] Ejecutar manualmente workflow → `monitor` y crear baseline inicial.
- [ ] Ajustar `DB_MASS_CHANGE_ROW_THRESHOLD` después de observar carga normal.
- [ ] Activar variable `DB_SECURITY_OPERATIONS_ENABLED=true`.
- [ ] Confirmar siguiente ejecución horaria, diaria y mensual programada.

## E. Validación final para cerrar #24

- [ ] Vercel está operando con `contagest_runtime`, no `postgres`/`service_role`.
- [ ] Migraciones usan una credencial diferente al runtime.
- [ ] Existe al menos un backup off-site cifrado verificable.
- [ ] Existe al menos un restore drill PASS.
- [ ] Monitor de DML/roles/licencias tiene baseline y canal de alerta operativo.
- [ ] El runbook `DATABASE_SECURITY_RECOVERY_RUNBOOK.md` tiene responsable operativo asignado.

**No cerrar #24 solo porque el PR haya sido mergeado.** El cierre requiere evidencia de los puntos anteriores.
