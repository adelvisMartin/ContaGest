# Control Hípico — API canónica y operación local por CMD/PowerShell

## Autoridad

La API de dominio es `/api/v1/hipico/*`. Los endpoints `/api/v1/hipico-bot/*` se mantienen como adapters de integración/compatibilidad para WhatsApp, Bridge y transporte; no son el dominio canónico de carreras, documentos, providers o agentes.

En desarrollo local el CLI usa por defecto `http://127.0.0.1:3030`. HTTP remoto está prohibido por el CLI; una URL no local debe usar HTTPS explícito.

## Variables locales

No pases tokens como argumentos: quedarían en el historial del shell. Configura secretos por variables de entorno del proceso/servicio.

Variables usadas:

- `HIPICO_API_BASE_URL` — opcional; default `http://127.0.0.1:3030`.
- `HIPICO_GROUP_KEY` — scope canónico del grupo, por ejemplo `group-1` o la clave operativa configurada.
- `HIPICO_OPERATOR_CONTROL_TOKEN` — token operador primario, mínimo 32 bytes. `HIPICO_BOT_OPERATOR_TOKEN` queda como fallback de compatibilidad.
- `HIPICO_GROUP_BRIDGE_TOKEN` — token Bridge, mínimo 32 bytes.
- `HIPICO_SOURCE_GROUP_ID` — ID WhatsApp SOURCE cuando se desea consultar estado del agente.

No se versionan valores reales de estas variables.

## CLI raíz

Desde la raíz del repositorio:

```text
npm run hipico -- version --json
npm run hipico -- status --json
npm run hipico -- readiness --json
npm run hipico -- doctor --json
npm run hipico -- command-center --group group-1 --json
npm run hipico -- meetings --group group-1 --json
npm run hipico -- races --group group-1 --json
npm run hipico -- documents --group group-1 --json
npm run hipico -- providers --group group-1 --json
npm run hipico -- bridge-health --json
```

`doctor` sólo realiza lecturas. No abre/cierra carreras, no publica resultados y no toca ledger/saldos.

## Endpoints canónicos

### Sistema

- `GET /api/v1/hipico/system/version`
- `GET /api/v1/hipico/system/status`
- `GET /api/v1/hipico/system/readiness`

Son lecturas `no-store` para versionado/readiness.

### Command Center

- `GET /api/v1/hipico/command-center`
- Header: `x-hipico-operator-token`
- Header: `x-hipico-group-key`
- Query opcional: `groupId=<WhatsApp group id>`

Agrega backend/DB/Bridge/canales/providers/agente/meeting/carrera actual/próxima/documentos/cola/conflictos/alertas. No contiene secretos ni bytes PDF.

La PWA **no** recibe el token operador. Usa `GET /api/hipico/command-center` (BFF serverless): valida la sesión Supabase del dueño y el servidor añade las credenciales internas al delegar al backend canónico.

### Meetings y carreras

- `GET|POST /api/v1/hipico/meetings`
- `GET /api/v1/hipico/meetings/:id`
- `POST /api/v1/hipico/meetings/:id/races`
- `GET /api/v1/hipico/races`
- `GET /api/v1/hipico/races/:id`
- `GET /api/v1/hipico/races/:id/history`
- `POST /api/v1/hipico/races/:id/commands`
- `GET /api/v1/hipico/queries/races?text=...`

Los comandos requieren `requestId`, `expectedState`, actor, `correlationId` y evidencia cuando aplique. El mismo `requestId` no puede representar contenido diferente.

### Documentos

- `GET /api/v1/hipico/documents/capabilities`
- `POST /api/v1/hipico/documents` (`application/pdf`)
- `GET /api/v1/hipico/documents`
- `GET /api/v1/hipico/documents/:id`
- `GET /api/v1/hipico/documents/:id/extraction`
- `POST /api/v1/hipico/documents/:id/reprocess`
- `POST /api/v1/hipico/documents/:id/approve`

Raw PDF permanece server-side. El engine rechaza PDF vacío/corrupto, contenido activo hostil, exceso de tamaño/páginas y controla autoridad de `OFFICIAL_RESULT`.

### Providers/live

- `GET /api/v1/hipico/providers`
- `GET /api/v1/hipico/providers/:providerId`
- `GET /api/v1/hipico/providers/:providerId/capabilities`
- `GET /api/v1/hipico/providers/:providerId/health`
- `GET /api/v1/hipico/live/:providerId/meetings`
- `GET /api/v1/hipico/live/:providerId/races/:externalId`
- `GET /api/v1/hipico/live/:providerId/races/:externalId/entries`
- `GET /api/v1/hipico/live/:providerId/races/:externalId/scratches`
- `GET /api/v1/hipico/live/:providerId/races/:externalId/result`

Providers son fuentes informativas; `financialAuthority=false`.

### Agente/Shadow

- `GET|POST /api/v1/hipico/groups/:groupId/automation`
- `POST /api/v1/hipico/groups/:groupId/automation/evaluate`
- `GET /api/v1/hipico/groups/:groupId/automation/evaluations`
- `POST /api/v1/hipico/groups/:groupId/automation/evaluations/:id/review`

SHADOW/ASSISTED no actúan directamente. Las promociones automáticas dependen de métricas persistidas y gates.

## Adapter WhatsApp Web / Bridge

Backend compatibility:

- `GET /api/v1/hipico-bot/bridge/health`
- `POST /api/v1/hipico-bot/bridge/events`
- `POST /api/v1/hipico-bot/bridge/handoff`

El Bridge Windows ya ofrece operación por terminal dentro de `tools/hipico-whatsapp-web-bridge`:

```text
npm run diagnostic:status
npm run healthcheck
npm run capture:groups
npm run spool:replay
npm run support:bundle
```

La captura oficial es SOURCE read-only → LAB shadow mientras no exista promoción explícita. No se habilita envío al grupo fuente por estos comandos.

## Seguridad local

- Backend/CLI no deben imprimir tokens.
- El CLI impide HTTP no local.
- Command Center/BFF usa `Cache-Control: no-store`.
- Service Worker no cachea `/api`, `/auth`, RPC, webhook ni metadata runtime.
- Los endpoints de operador fallan cerrados si el token es débil/ausente.
- Los IDs de grupo se validan antes de construir URLs o queries.
