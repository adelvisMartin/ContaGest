# Control Hípico — Bridge Queue/Replay (#112)

`spool-journal.mjs` define el contrato v2 de cola durable: `queued`, `sent`, `failed`, `quarantined`, `replayed`, `expired`.

- Cada registro declara `schemaVersion`, `parserVersion`, identidad estable, attempts/retry budget y timestamps.
- Escritura segura: archivo temporal exclusivo → `fsync` → `rename`; `ENOSPC` se transforma en `SPOOL_DISK_FULL` y no se finge persistencia.
- Retry: backoff exponencial + jitter y límite; al agotar budget pasa a quarantine.
- Formato viejo/corrupto/parser incompatible no es elegible automáticamente y se mueve a quarantine.
- Estados terminales no vuelven a queued.
- `planReplay()` exige destino exacto esperado y devuelve cantidad/lista antes de ejecutar.
- El CLI `npm run spool:replay:dry-run -- --dir=... --destination=<lab-channel-key>` es deliberadamente dry-run-first. `--execute=true` se niega hasta que exista un adapter runtime explícito; esto impide que una cola heredada se dispare por instalar el código nuevo.

## Estado de integración

Este PR endurece el formato, validación, quarantine y planeación/replay seguro. El `index.mjs` histórico todavía usa el spool v1 para la captura viva; por seguridad no se cambia a v2 de forma silenciosa. La migración del productor v1→v2 debe hacerse en un cambio controlado que convierta/acuse los pendientes y pruebe restart en cada fase antes de habilitar ejecución real.

Por esta razón #112 no debe considerarse completamente cerrado hasta cablear el productor live al journal v2 y ejecutar el crash/restart drill con el Bridge real.
