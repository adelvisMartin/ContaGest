# Control Hípico — CLI local y API canónica

La CLI operativa vive en `tools/hipico-cli/hipico.mjs` y puede ejecutarse con:

```bash
npm run hipico -- <comando>
node tools/hipico-cli/hipico.mjs <comando>
```

En Windows también existen `HIPICO.cmd` y `HIPICO.ps1`.

## Configuración

Los secretos se leen exclusivamente desde variables de entorno:

- `HIPICO_API_BASE_URL` — por defecto `http://127.0.0.1:3030`; HTTP solo está permitido para loopback/local.
- `HIPICO_OPERATOR_CONTROL_TOKEN` — token de operador (compatibilidad: `HIPICO_BOT_OPERATOR_TOKEN`).
- `HIPICO_GROUP_BRIDGE_TOKEN` — token del Bridge para `bridge status`.
- `HIPICO_GROUP_KEY` — scope lógico de grupo para reads que lo requieren.
- `HIPICO_SOURCE_GROUP_ID` — id externo opcional para Command Center.

No se aceptan tokens como argumentos CLI para evitar filtrarlos en history/process listings.

## Comandos

```text
status
readiness
version
doctor
bridge status
command-center
groups
meetings
races
documents
providers
messages tail
events tail
events stream
trace <correlationId>
```

Flags disponibles:

```text
--group <groupKey>
--group-id <whatsappGroupId>
--limit <1..200>
--base-url <url>
--json
```

## Contrato HTTP actual

Los endpoints de sistema canónicos son:

- `GET /api/v1/hipico/version`
- `GET /api/v1/hipico/status`
- `GET /api/v1/hipico/readiness`

Todos atraviesan la frontera de operador y la CLI envía `x-hipico-operator-token`. Los reads por grupo envían además `x-hipico-group-key`. Bridge health permanece en `/api/v1/hipico-bot/bridge/health` porque pertenece a la superficie de integración/compatibilidad.

## Seguridad

La CLI rechaza credenciales embebidas en URL, query/hash/base paths arbitrarios, redirects y HTTP remoto en claro. Las respuestas se solicitan con `cache: no-store` y las operaciones puntuales usan timeout abortable. `events stream` usa SSE y no se combina con `--json`.

## Diagnóstico

`doctor` consulta version/status/readiness con el token de operador, Command Center si hay group key y Bridge health si existe token Bridge. Un fallo de readiness se muestra como no listo; la CLI no convierte degradación en PASS.
