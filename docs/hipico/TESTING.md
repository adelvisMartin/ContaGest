# Control Hípico · Testing

## Matriz mínima

- Unit/characterization: parsers WhatsApp, operaciones, deduplicación, montos, cierres, reglas POLLA cuando se migren.
- Persistencia: IndexedDB schema, upgrade, transacciones, outbox, snapshots y exportación.
- PWA: manifest, instalación, service worker, actualización, offline, recuperación y cache sensible.
- UI real: 360, 480, 768, 1024 y 1280+ px; Light/Dark/System; teclado; zoom 200%; sin overflow accidental.
- E2E: Captura → persistencia → outbox → sync → reconciliación; cierre; restauración; WhatsApp shadow mode.
- Seguridad: secretos, CSP, RLS, autorización, rate limit, replay, idempotencia y doble submit.

## Regla de evidencia

Un test agregado al repositorio no equivale a PASS. Solo se registra PASS cuando el runner o navegador realmente lo ejecutó y existe resultado verificable. Si GitHub Actions no obtiene runner, el estado es `BLOCKED/NOT EXECUTED`.

## Release gate

No promover una automatización WhatsApp o migración destructiva solo por build exitoso. Debe existir caracterización funcional, datos de prueba, rollback y evidencia E2E.
