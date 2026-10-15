# Control Hípico · vínculos compartibles de consulta (implementación 2026-10-15)

## Hecho y límites de la referencia

Las URLs facilitadas por el usuario incluyen `?t=<valor opaco>`. El mismo valor aparece en historial y movimientos, mientras que la página personal tiene uno diferente. **Esta observación no demuestra que el valor sea el ID real del grupo ni autoriza inferir las tablas PHP ajenas.** Las tres consultas directas fueron rechazadas por la herramienta de navegación y el entorno no resuelve el DNS del dominio. REA no capturó HTML/DOM; esta es una implementación propia, no un clon validado.

## Arquitectura nueva

```text
Operador autorizado (HIPICO_OPERATOR_CONTROL_TOKEN)
    -> POST /api/v1/hipico/report-shares
       { groupKey, audience: participant|group, participantCode?, hours }
       -> Postgres HIPICO_OWNER_ID + group_key + SHA-256(token aleatorio 256 bits)
          token claro SOLO en la respuesta de emisión
    -> GET /api/v1/hipico/report-shares?groupKey=...
       -> lista id, scope, caducidad, revocación (SIN hashes/tokens)
    -> DELETE /api/v1/hipico/report-shares/:id -> revoca
Lector del vínculo
    -> GET /api/v1/hipico/report-shares/public?t=<token>&date=AAAA-MM-DD
       -> token SHA-256 y contexto owner+grupo desde BD
       -> vencimiento y revocación verificados ANTES del ledger
       -> estado histórico desde hipico_money_ledger_entries únicamente
       -> HTML sin terceros / JSON negociado, sin cookies ni cambios de estado
```

**Privilegios y tenancy:** la nueva tabla tiene RLS y deniega anon/authenticated; `contagest_runtime` únicamente consulta/modifica el owner vinculado por `set_config('hipico.report_owner_id', ..., true)` dentro de la transacción. El contexto `HIPICO_OWNER_ID` debe ser un UUID verificado; se falla cerrado si falta. La misma condición owner+grupo+participante se aplica en todas las lecturas. No se guardan tokens en claro, ni se consultan sin un token válido. La emisión exige que exista al menos un asiento real para ese grupo/participante; no crea saldos ficticios.

**Moneda y tiempo:** los importes vienen de `amount_minor NUMERIC(30,0)`, se transportan como string para preservar precisión y se presentan con dos decimales sin `Number`. No se mezclan USD, VES ni otras divisas. La fecha de operación se interpreta en `America/Caracas` (UTC-04) para capturar el día local correcto incluso durante la noche. Una fecha sin selección corresponde al día vigente de Caracas.

**Exposición de datos:** un enlace de grupo autoriza ver códigos de participante y movimientos financieros de ese grupo; NO debe emitirse al público abierto. Un enlace personal se limita a un código de participante. Los listados están limitados a 100 filas y declaran truncamiento. No hay fotografías, teléfonos, mensajes, notas internas, identificadores de evidencias, fuente WhatsApp, historial de otras cuentas, credenciales ni autoridad para operar dinero.

**Salvedad de consistencia:** el reporte web/PWA construido en PR #999 usa el workspace de IndexedDB/Supabase; esta API nueva usa exclusivamente el ledger canónico PostgreSQL. Es posible que su cobertura histórica difiera si la sincronización aún no ha confirmado movimientos. Se **declara** la fuente `canonical-postgresql-ledger` y `racesAvailable: false` en lugar de presentar imágenes de pizarra inventadas. La conciliación de ambos orígenes y el render completo de carreras reales requieren ticket e integración posterior.

## Despliegue con puertas explícitas

1. Revisar y desplegar la migración `backend/prisma/migrations/20261015035000_hipico_report_share_links/migration.sql` con el mecanismo de migración auditada existente, jamás mediante `db push` destructivo. Validar roles, RLS y sus grants.
2. Configurar `HIPICO_OWNER_ID` y `HIPICO_OPERATOR_CONTROL_TOKEN` **solo en backend**, nunca en frontend, scripts o enlace compartido.
3. En un canal administrativo seguro, ejecutar:

```bash
curl -X POST 'https://TU_BACKEND/api/v1/hipico/report-shares' \
  -H 'Content-Type: application/json' \
  -H 'x-hipico-operator-token: <SECRET_OPERADOR_EN_VARIABLE_PROTEGIDA>' \
  -d '{"groupKey":"grupo-autorizado","audience":"participant","participantCode":"codigo-autorizado","hours":24}'
```

El ejemplo de `curl` es ilustrativo: en producción usar entorno seguro que no almacene la credencial en historial de shell ni logs. La API devuelve un enlace relativo con `?t=` que debe compartirse **solo con destinatarios autorizados**. La respuesta que contiene el secreto no debe archivarse en sistemas de tickets ni pegarse en el chat.

4. Consultar los enlaces activos con `GET /api/v1/hipico/report-shares?groupKey=grupo-autorizado` y el mismo header de operador. Revocar por UUID de respuesta con `DELETE /api/v1/hipico/report-shares/:id`.

**Riesgo operativo inherente al query parameter:** `?t=` sigue siendo una credencial URL, susceptible a historial del navegador, registros del proxy/hosting o divulgación por reenvío. La respuesta deshabilita caché, robots, referrers, recursos externos y framing; los logs internos deben usar solo template de ruta sin query. En producción configurar el gateway/edge/CDN para REDACTAR el query `t` **antes de registrar solicitudes**. No distribuir el enlace vía servicios de analítica ni cargar píxeles. Revocar inmediatamente ante pérdida, y limitar aún más los TTL según el riesgo.

## QA y rollback

```bash
npm --workspace backend run typecheck
npm --workspace backend run test:hipico
npm --workspace backend run prisma:deploy   # migración autorizada, en entorno staging primero
```

Los tests HTTP de `report-share.routes.test.ts` son sintéticos con store simulado; no prueban la política RLS en un PostgreSQL real. Por ello se exige integración PostgreSQL, comprobación efectiva del rol runtime y E2E navegador antes de distribuir enlaces con datos reales.

**Estado:** no se ha desplegado la migración en producción, creado ningún enlace real, expuesto dinero de clientes ni activado WhatsApp. La interfaz pública es de lectura exclusiva. Para rollback deshabilitar el montaje del router; conservar registros de revocación en BD hasta el período de retención correspondiente. Ningún rollback borra el ledger.
