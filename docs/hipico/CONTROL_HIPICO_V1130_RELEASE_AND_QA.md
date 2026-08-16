# Control Hípico v1.13.0 RC1 — restauración web y gate de producto

**Producto:** Control Hípico  
**Estado:** RC recuperada para QA; no equivale a release Android final hasta completar dispositivo real/Bridge.  
**Baseline:** `Hipico-Control-v1.13.0-RC1.apk`  
**Runtime web recuperado:** `1.13.0-parity.1`

## Frontera de producto

Control Hípico es independiente de ContaGest ERP. Comparte temporalmente repositorio, PostgreSQL y proceso backend, pero mantiene:

- ruta `/hipico-control/`;
- PWA, manifest, service worker, IndexedDB/outbox y UI propios;
- namespace backend `/api/v1/hipico-bot/*`;
- migraciones con ownership Hípico;
- release y QA propios;
- wrapper Android/Capacitor propio.

No pertenece a `MODULE_CATALOG`, business modes, breadcrumbs ni permisos del ERP.

## Restauración determinista

El runtime recuperado se conserva como `products/hipico-control/runtime/v1.13.0-rc1/runtime.zip.b64` con SHA-256 fijado. `scripts/restore-hipico-runtime.mjs` valida el hash, bloquea path traversal y extrae únicamente dentro de `frontend/public/hipico-control/`.

La restauración reutiliza los SVG de marca ya versionados y elimina únicamente los archivos conocidos del shell simplificado anterior antes de materializar RC1.

`npm run build:frontend` ejecuta `npm run hipico:restore` antes de Vite; por tanto Vercel y desarrollo local reciben la misma fuente Hípico sin convertirla en módulo ERP.

## Bot / WhatsApp

La Cloud API oficial se limita a destinatarios individuales en esta implementación. El grupo requiere un Bridge soportado y permanece fuera de la automatización directa.

Variables server-side:

- `WHATSAPP_CLOUD_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_VERSION`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `HIPICO_BOT_OPERATOR_TOKEN`
- `HIPICO_BOT_PROMOTION=shadow|approved|automatic`

### Gates

- `shadow`: clasifica/propone; no envía automáticamente.
- `approved`: salida requiere aprobación del operador.
- `automatic`: solo intents seguros y únicamente cuando PostgreSQL Hípico está disponible para idempotencia/auditoría.
- jugadas, saldos, pagos, cierres, resultados, liquidaciones y premios nunca son auto-elegibles.

El webhook valida `x-hub-signature-256`. La deduplicación usa `providerMessageId` único + `INSERT ... ON CONFLICT DO NOTHING RETURNING`, evitando doble outbox en reenvíos concurrentes.

## Migración

`0014_v1126_hipico_bot` contiene exclusivamente:

- `HipicoWebhookEvent`
- `HipicoBotOutbox`

Se retiraron las tablas Fitness que estaban mezcladas en el paquete previo: Fitness/Nutrición pertenecen al ERP ContaGest.

## Android

`android/hipico-control-v1130/` es un wrapper independiente. `sync:web` ejecuta primero la restauración canónica y copia exclusivamente `/frontend/public/hipico-control` a `www`.

No se versionan keystores, `key.properties`, builds ni `local.properties`.

## QA de salida

Antes de declarar la APK final:

1. restauración/hash RC1 verde;
2. build frontend verde;
3. PWA: instalación, actualización, offline, cache version y recuperación;
4. flujo Hípico: captura → participantes → carrera → POLLA/riesgo → adelantadas → llegada → cierre → liquidación → historial/exportación;
5. IndexedDB/outbox/idempotencia y reinicio de aplicación;
6. webhook HMAC + dedupe concurrente;
7. shadow sin side effects monetarios;
8. Android debug en dispositivo físico: navegación, back button, teclado, safe areas, rotación, reanudación, archivos/exportación;
9. Bridge/grupo probado por separado antes de cualquier promoción;
10. release firmado únicamente cuando los puntos anteriores tengan evidencia.

## Rollback

El runtime Hípico puede revertirse independientemente del ERP: retirar el commit/PR de este producto devuelve la PWA previa sin tocar `frontend/src/`, `MODULE_CATALOG` ni los verticales ContaGest. Las tablas Hípico requieren migración de rollback explícita si ya contienen datos; nunca se borran como parte de un rollback visual.
