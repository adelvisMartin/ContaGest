# Runbook de producción · #566

## Flujo autorizado

El flujo de release es: **candidate SHA → config preflight → dependencias bloqueadas → migraciones forward-only → verificación de migraciones → build/artifact hash → deploy → `/health/live` + `/health/ready` → smoke → observación → promoción**. El SHA completo debe viajar en `GIT_COMMIT_SHA` y aparecer como `buildCommit` en health y observabilidad.

Ningún test de despliegue escribe datos reales. El drill CI usa PostgreSQL efímero y tenants/fixtures propios. Staging debe usar un tenant sintético explícito. Producción sólo ejecuta probes de lectura/no sensibles salvo una operación de negocio autorizada por un runbook específico.

## Configuración y paridad

`ops/release/production-config-v566.json` es la matriz versionada. Los secretos se validan por presencia/fortaleza y **nunca se imprimen**. `DATABASE_RUNTIME_URL` pertenece al proceso de aplicación; `DIRECT_DATABASE_URL` es exclusiva para migración/operación autorizada. `ALLOW_DEV_TENANT_HEADER=true` está prohibido en staging/production.

Las desviaciones de staging respecto de producción deben añadirse a la matriz antes del deploy; un valor tribal/no documentado se considera drift.

## Migraciones: expand → migrate → contract

Las migraciones son **forward-only**. Para cambios incompatibles se usa:

1. **expand**: agregar columnas/tablas/contratos compatibles sin retirar lo existente;
2. **migrate**: backfill/reconciliar con jobs idempotentes y evidencia;
3. **contract**: retirar el contrato viejo sólo después de confirmar que ningún runtime compatible lo necesita.

`prisma:deploy` se ejecuta una vez por candidate y un fallo detiene promoción. `migration-state-v566.mjs` rechaza migraciones inconclusas o nombres aplicados duplicados. No se corrige una migración productiva ejecutando un `down.sql` ad hoc.

## Rollback de aplicación

El rollback de aplicación selecciona un artifact previamente firmado/hasheado y asociado a un SHA conocido. Antes de cambiar tráfico se comprueba que el esquema DB expandido siga siendo backward-compatible con ese artifact. Si no lo es, el rollback de aplicación queda **BLOCKED** y se continúa con forward-fix o recovery de datos según incidente. Nunca se mueve `main`, se reescribe historia ni se altera producción manualmente para simular rollback.

## Recovery de base de datos

La recuperación de DB es distinta del rollback de aplicación. Para pérdida/corrupción se restaura un backup/PITR en una instancia aislada, se valida integridad/tenant scope y sólo entonces se autoriza el cutover. El workflow #566 practica este contrato con `pg_dump`/`pg_restore` en `contagest_recovery_v566`; jamás restaura encima de la base fuente.

## Smoke y observación

Los probes mínimos son liveness, readiness, correspondencia exacta de `buildCommit` y error envelope 404 sin stack. Los smokes autenticados de negocio deben usar un tenant sintético de staging y credenciales efímeras; nunca cuentas ni facturas reales. Métricas, logs y trace IDs deben correlacionar el candidate SHA sin PII/secrets.

## Rotación de secretos

1. crear nueva versión en el proveedor de secretos sin imprimir/copiar a logs;
2. desplegar candidate que acepte la transición cuando el protocolo requiera overlap;
3. verificar health/smoke;
4. revocar la versión anterior;
5. registrar actor, hora, secreto lógico (nombre, no valor), release SHA y resultado.

Si la rotación involucra JWT/session signing, definir explícitamente si las sesiones existentes se invalidan o si hay ventana de doble validación. No improvisar ambas claves dentro del código fuente.

## Provider outage

Ante **provider outage**, mantener el dominio fail-closed para efectos financieros/autoritativos, usar cache/stale sólo donde el contrato lo permita, exponer degradación en observabilidad y evitar retries sin límite. Para Hípico, SOURCE/financial authority no se habilitan por una caída del proveedor. Restaurar tráfico automático únicamente después de los health/probes del adapter.

## Incidente y cierre

Congelar el candidate SHA, capturar logs/artifacts del mismo SHA, clasificar si el fallo es aplicación, migración, proveedor o infraestructura y ejecutar únicamente el procedimiento correspondiente. Un deploy no se declara exitoso por estar iniciado: requiere migraciones verificadas, health/ready, smoke y observación. Los bloqueos del proveedor se reportan aparte de la calidad del código.
