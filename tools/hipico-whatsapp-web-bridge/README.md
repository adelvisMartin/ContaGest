# Control Hípico · WhatsApp Web Bridge v1.6.0

Bridge de Control Hípico para observar el grupo oficial mediante WhatsApp Web y ejecutar automatización conversacional segura en LAB.

```text
SOURCE real (read-only)
  -> WhatsApp Web + Playwright adapter
  -> spool durable / dedupe / anti-loop
  -> backend Hípico
  -> clasificación + Risk Policy + response arbiter
  -> propuesta/auditoría
  -> LAB (auto-reply QA autorizado)
```

## Estado de política SOURCE

La Política de mensajes de WhatsApp Business revisada el **2026-09-29** incluye apuestas con dinero real entre los usos prohibidos de los Servicios de WhatsApp Business. El Bridge por tanto mantiene SOURCE automático en **NO-GO**.

- `HIPICO_SOURCE_AUTO_REPLY_ENABLED=true` falla validación.
- `.env`, licencia, país o metadata de revisión no levantan el gate.
- `npm run source:policy` explica el estado sin imprimir secretos.
- LAB continúa disponible para pruebas autónomas seguras.

Referencia de política: `https://business.whatsapp.com/policy/`.

## Transport capability contract

v1.6 desacopla la capacidad técnica del permiso de negocio mediante `src/transport-capabilities.mjs`.

### `playwright-web`

- `implemented=true`
- `official=false`
- `sourceRead=true`
- `labSend=true`
- `groupSend=true` técnicamente
- media soportada como contexto

Es el adapter actual. La capacidad técnica de enviar **no** autoriza SOURCE.

### `cloud-api`

- `official=true`
- `implemented=false`

Está registrado únicamente como boundary futuro. Seleccionarlo hoy falla validación para evitar una falsa sensación de soporte. Aun implementándolo, el gate de apuestas con dinero real seguirá bloqueando este caso mientras la política oficial no cambie.

## Invariantes de seguridad

- SOURCE nunca recibe escritura automática mientras el snapshot de política sea NO-GO.
- LAB requiere SOURCE/LAB IDs `@g.us` pinneados y distintos.
- cambiar de chat antes de un envío cancela la acción por identity guard.
- mensajes propios (`message-out` / `fromMe`) se excluyen del ingest para evitar loops.
- backend/conversation reply no concede autoridad de escritura financiera.
- jugadas, saldos, pagos, cierres, resultados, premios y liquidaciones no se aplican automáticamente.
- producción exige backend HTTPS, token fuerte, journal shadow y pinning de grupos.
- si backend falla, el evento permanece en spool.
- una entrega incierta se marca `ambiguous`; no existe retry ciego.
- documentos/PDF/imágenes/audio/video no conceden autoridad financiera.
- kill switch local bloquea promoción/envío cuando corresponde.

## Binding de grupos

En Windows:

```powershell
.\INICIAR.ps1 -CaptureGroupIds
```

O desde la raíz:

```text
CONFIGURAR-GRUPOS-HIPICO.cmd
```

Se guardan localmente:

```text
%LOCALAPPDATA%\ControlHipicoBridge\data\group-bindings.json
%LOCALAPPDATA%\ControlHipicoBridge\data\group-bindings.env
```

Los nombres son sólo discovery hints; el envío LAB valida el ID real.

## Prueba autónoma LAB

Desde la raíz:

```text
PROBAR-HIPICO-LAB.cmd
```

O:

```text
INICIAR-HIPICO-AUTONOMO.cmd
```

Directamente desde el bridge:

```powershell
.\INICIAR.ps1 -EnableLabSend -EnableLabInput
```

Antes de comenzar puedes comprobar capacidades/política:

```powershell
npm run source:policy
```

## Comandos

```text
npm ci --no-audit --no-fund
npm run qa
npm run production:check
npm run source:policy
npm run capture:groups
npm start
npm run healthcheck
npm run diagnostic:status
npm run spool:replay
npm run report
npm run support:bundle
```

`spool:replay` reintenta únicamente trabajo permitido por la política de replay/idempotencia; no fabrica eventos ni convierte `ambiguous` en un envío seguro.

## Persistencia durable

Bajo el data directory local:

- `chrome-profile/`: sesión vinculada;
- `spool-v2/`: journal durable;
- `spool-events/`: compatibilidad de pendientes;
- `spool-lab-mirror/`: mirrors LAB;
- `source-replies/`: estados `prepared`, `sending`, `sent`, `ambiguous`;
- `seen-source-message-ids.json`: dedupe SOURCE;
- `seen-lab-test-message-ids.json`: dedupe LAB;
- `training/`: journal shadow pseudonimizado;
- `health.json`: readiness/counters;
- `retry-state.json`: backoff backend.

No borrar `data/` durante update/rollback.

## Observabilidad

`health.json` y `npm run diagnostic:status` exponen estado operativo sin token ni texto completo del chat. v1.6 añade:

- adapter actual;
- capacidades técnicas relevantes;
- estado `DISABLED/NO_GO` de SOURCE;
- snapshot y reasons de política;
- disponibilidad técnica LAB.

Para SOURCE el resultado esperado es `sourceSendPossible=false`.

## Recuperación

El launcher supervisa cierres inesperados del browser y reinicia con backoff limitado conservando spool/journals. Un perfil dañado se aísla, no se destruyen las colas.

## Hosted worker

Existen plantillas bajo `deploy/linux/` y `deploy/docker/`. Cada host necesita una sesión vinculada propia, almacenamiento persistente y secretos externos al repo. No copiar una sesión de laptop ciegamente a otro host.

## QA local

```bash
npm ci --no-audit --no-fund
npm run qa
npm audit --omit=dev --audit-level=high
npm run selftest
npm run source:policy
```

Runbook completo: `docs/hipico/QA_DOWNLOAD_AND_BOT_TEST.md`.

Revisión técnica/mercado: `docs/hipico/WHATSAPP_READINESS_2026-09-29.md`.

## Riesgo residual

El adapter Playwright automatiza WhatsApp Web y no es una API oficial. Cambios DOM, cierre de sesión o cambios de proveedor pueden requerir adaptación/revinculación. Por eso se mantienen spool, health, identity guard, anti-loop, journal ambiguo y physical QA.

No se adopta Baileys/WebSocket como cambio de último minuto: sigue siendo una integración no oficial y migrar transportes antes de una jornada física añade riesgo sin resolver la política SOURCE.
