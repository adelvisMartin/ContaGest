# ContaGest — Self-hosting runbook de bajo costo

## Objetivo
Tener una ruta comercial sostenible sin pagar infraestructura administrada antes de tener ingresos. Mientras no existan clientes pagos, la demo/QA puede seguir en la infraestructura gratuita actual. **Este runbook no migra ni modifica Budget Wallet ni Hípico.**

## Cuándo usar este stack
- No comprar VPS por un prospecto.
- Activarlo después de una orden/deposito/pago inicial que cubra dominio + infraestructura + onboarding.
- Para datos reales usar un entorno de producción dedicado; el Supabase compartido queda para pruebas hasta que exista ese ingreso.

## Arquitectura mínima
`Internet -> Caddy/TLS -> frontend estático + /api reverse proxy -> Node/Express -> PostgreSQL`

Servicios Docker:
- `web`: Caddy, TLS automático y frontend.
- `api`: ContaGest backend, sin exponer puerto público.
- `db`: PostgreSQL 17 en red privada.
- `migrate`: proceso one-shot con credencial propietaria; el runtime usa `contagest_app`.

## Preparación del VPS
1. Debian/Ubuntu actualizado, usuario administrativo sin login root por contraseña.
2. SSH por clave; desactivar password login cuando se haya validado la clave.
3. Firewall: permitir solo SSH, 80 y 443. PostgreSQL 5432 **no** se publica.
4. Instalar Docker Engine + Compose plugin.
5. Clonar el repo y checkout del release firmado, no una rama mutable.
6. Copiar `ops/docker/.env.example` a `ops/docker/.env`, generar secretos diferentes y `chmod 600`.
7. DNS del subdominio hacia la IP del VPS.

## Primer despliegue
Desde `ops/docker`:
```bash
docker compose --env-file .env -f docker-compose.production.yml build
docker compose --env-file .env -f docker-compose.production.yml up -d
```
Verificar:
```bash
docker compose -f docker-compose.production.yml ps
curl -fsS https://TU_DOMINIO/health
```

## Privilegio mínimo
- `contagest_owner`: solo migraciones/DDL y mantenimiento.
- `contagest_app`: login del backend runtime; hereda permisos CRUD de `service_role`, no es superuser, no crea DB/roles y no tiene BYPASSRLS.
- Nunca configurar el API con la contraseña de `contagest_owner`.
- `DATABASE_RUNTIME_URL` tiene precedencia en runtime.

## Backups
Para un DB dedicado: `BACKUP_SCOPE=full`.
Para el Supabase compartido de pruebas: dejar `BACKUP_SCOPE=contagest-shared`; la lista explícita evita capturar `budgetwallet_*` y `hipico_*`.

Ejemplo de cron diario:
```bash
DATABASE_URL='...' \
BACKUP_AGE_RECIPIENT='age1...' \
RCLONE_REMOTE='b2-immutable:contagest-prod' \
/opt/contagest/ops/backup/backup-postgres.sh
```
Regla 3-2-1 mínima: base activa + copia local corta cifrada + copia externa cifrada. Para ransomware, habilitar retención/immutabilidad/Object Lock en el proveedor externo cuando esté disponible. Una copia montada en el mismo VPS no es backup externo.

## Restore drill
Al menos mensual y antes de cambios grandes:
```bash
RESTORE_DATABASE_URL='postgresql://.../contagest_drill' \
BACKUP_FILE='/backups/contagest-....dump.age' \
AGE_IDENTITY='/root/keys/contagest-backup.agekey' \
./ops/backup/restore-drill.sh
```
El script se niega a restaurar en una DB cuyo nombre no termine en `_restore` o `_drill`, salvo override explícito.

## Actualización
1. Backup + checksum + confirmación externa.
2. Checkout del tag/release objetivo.
3. `docker compose build`.
4. `docker compose up -d`; `migrate` debe terminar 0 antes del API.
5. Smoke: `/health`, login, ventas, contabilidad, reportes y licencia.
6. Mantener la imagen/tag anterior hasta terminar smoke test.

## Monitoreo mínimo
- Uptime HTTP externo sobre `/health`.
- alertas disco >80%, RAM sostenida >85% y reinicios.
- logs con rotación.
- alertar backup faltante >26h y restore drill faltante >35 días.

## Límite del ahorro
Autohospedar reduce factura fija, pero traslada parches, monitoreo, backups, restauración y seguridad de SSH. El objetivo es hacerlo reproducible y financiado por ventas, no asumir que operar un VPS cuesta cero horas.
