# Control Hípico — Bridge Queue/Replay (#112)

El Bridge live usa el journal v2 como owner canónico de la cola durable. El contrato de estados es: `queued`, `sent`, `failed`, `quarantined`, `replayed`, `expired`.

## Runtime conectado

`tools/hipico-whatsapp-web-bridge/src/index.mjs` instancia `createBridgeSpoolRuntime()` sobre `HIPICO_DATA_DIR/spool-v2` y conecta ambos efectos reales:

```text
mensaje SOURCE read-only
  -> backend-event v2
  -> backend ingest

clasificación/mirror
  -> lab-mirror v2
  -> LAB pinneado
```

La captura marca el mensaje fuente como `seen` sólo después de persistir los trabajos durables requeridos. Un fallo de persistencia (incluido `ENOSPC`) no se convierte silenciosamente en mensaje procesado.

La ruta de envío continúa existiendo únicamente para LAB y vuelve a ejecutar `assertCurrentLabIdentity()` antes del envío. El grupo SOURCE permanece read-only y `health.json` conserva `sourceSendPossible: false`.

## Persistencia y recuperación

Cada registro v2 declara `schemaVersion`, `parserVersion`, identidad estable, estado, attempts/retry budget y timestamps.

La escritura usa archivo temporal exclusivo -> flush/fsync -> rename atómico -> intento de fsync del directorio. `ENOSPC` se transforma en `SPOOL_DISK_FULL`.

El delivery usa idempotency key estable por tipo de efecto. Un registro ya `sent`/`replayed` no vuelve a `queued` por una captura duplicada. El runtime además descarta una copia activa residual si ya existe el mismo `recordId` en estado terminal, cubriendo la ventana crash-after-send/move observada por el journal local.

Retry aplica backoff exponencial + jitter, `Retry-After` cuando corresponde y budget acotado. Errores no reintentables y budget agotado terminan en `quarantined`; registros demasiado antiguos terminan en `expired`.

## Upgrade desde spool v1

En cada arranque, `initialize()` inspecciona exclusivamente los directorios históricos:

- `spool-events`;
- `spool-lab-mirror`;
- `dead-letter`.

Los JSON legacy se convierten a registros v2 **en cuarentena** con `LEGACY_REQUIRES_EXPLICIT_REPLAY` y el archivo original se archiva bajo `spool-v2/legacy-archive/`. JSON corruptos también se aíslan. Ningún pendiente heredado se entrega automáticamente tras un upgrade.

## Replay manual

El CLI canónico es:

```bash
npm run spool:replay -- --kind=lab-mirror --destination=<HIPICO_LAB_CHANNEL_KEY>
```

Eso siempre produce primero un plan dry-run con cantidad, IDs, estados y destino. Puede limitarse con `--from=...`, `--to=...` y `--limit=...`.

Para reencolar exactamente el plan revisado:

```bash
npm run spool:replay -- \
  --kind=lab-mirror \
  --destination=<HIPICO_LAB_CHANNEL_KEY> \
  --execute=true \
  --expected-count=<N> \
  --confirm=REQUEUE
```

El destino para `backend-event` es literalmente `backend-ingest`. El CLI rechaza destino distinto, ausencia de `expected-count`, count cambiado o confirmación distinta a `REQUEUE`.

`--execute=true` **no envía directamente** a WhatsApp ni al backend: sólo mueve los IDs aprobados a `queued`. El runtime live sigue siendo la única ruta de delivery y conserva sus gates de identidad, rate limit, backend health y SOURCE read-only. Tras delivery exitoso, esos registros terminan en `replayed`.

## QA y estados de evidencia

Tests contractuales cubren idempotencia, retry/budget, migración legacy, JSON corrupto, destination mismatch, expected-count, replay y errores no reintentables. Un test de wiring verifica que `index.mjs` consume el runtime v2 y que no reaparecen los helpers ejecutables del spool v1.

La ejecución determinista aislada puede demostrar estas propiedades sin una sesión real de WhatsApp. El drill físico de crash/restart con Chrome/WhatsApp, backend y LAB reales pertenece a la evidencia final de #112/#119. Si GitHub Actions no asigna runner (`runner_id=0`, `steps=[]`), el estado es `BLOCKED/NOT_EXECUTED`, nunca `PASS`.

## Cierre de #112

La brecha arquitectónica del PR #169 —journal v2 creado pero productor live todavía en v1— queda corregida por este follow-up. Sin embargo, el issue sólo debe cerrarse cuando exista evidencia fresca del SHA candidato para el drill runtime requerido y no queden findings P0/P1 asociados a esta cola.
