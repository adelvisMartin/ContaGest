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

## Soak prolongado #120 · identidad del health endpoint

El comando canónico `npm --workspace backend run soak:hipico` requiere una jornada real de **24 horas como mínimo** para la certificación. La opción `soak:hipico:smoke` solamente prueba el runner y **nunca** produce evidencia de aprobación de release.

Cuando se indique `--health-url`, el runner sólo acepta HTTPS o HTTP contra `localhost`/`127.0.0.1`/`[::1]`. Rechaza credenciales incrustadas, consultas y fragmentos; el cliente tampoco sigue redirecciones, especialmente para proteger `HIPICO_BRIDGE_TOKEN`.

Una respuesta HTTP 200 **no demuestra salud**: se exige un JSON válido del contrato del backend Bridge con `ready: true`, `mode: "shadow"` y `sourceSendPossible: false`. Estados de mantenimiento, respuestas HTML, un modo equivocado, un SOURCE capaz de enviar, tokens rechazados o endpoints inaccesibles no incrementan la cobertura saludable y, si ocurren en el preflight de release, bloquean el intento. Los archivos de evidencia registran códigos acotados, no URL, cuerpo remoto ni secreto.

El PASS de #120 sigue requiriendo #119 física, drills de reinicio y recuperación, spool-v2, umbrales de memoria/latencia, horas reales y archivos de evidencia ligados al SHA exacto. Un PR de instrumentación **no** cierra estos gates.
