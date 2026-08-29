# Control Hípico — Offline / PWA Sync (#115)

## Principio

El modo offline aporta continuidad, **no autoridad**. Un saldo, resultado o workspace visto localmente nunca se describe como recién confirmado mientras el servidor no sea alcanzable o la sincronización esté stale.

## IndexedDB v2

`store.js` permanece como facade pública estable. `store-v2.js` es owner del schema local.

Schema v2 agrega:

- object store `syncMeta`;
- índice único `outbox.idempotencyKey`;
- versión explícita del schema local en workspaces/snapshots;
- diagnóstico y recuperación acotada por presión de cuota;
- binding de identidad cloud.

El upgrade es aditivo. Workspaces/settings/outbox/snapshots v1 se conservan. Nuevas mutaciones en cola requieren una clave estable de idempotencia.

## Outbox idempotente

La clave se obtiene de `idempotencyKey`, `id`, `sourceMessageId` o `externalMessageId`. Si no existe identidad estable, falla con `HIPICO_OUTBOX_IDEMPOTENCY_KEY_REQUIRED` en vez de crear una mutación imposible de reconciliar.

El índice único de IndexedDB hace converger intentos concurrentes duplicados en un registro.

## Privacidad usuario/workspace

El owner cloud se persiste separado de la sesión. En cambio de cuenta:

1. se flushean writes pendientes;
2. el workspace `primary` anterior se archiva bajo el owner previo;
3. se elimina el puntero primary;
4. se limpian outbox y snapshots privados;
5. se guarda el nuevo owner;
6. la página se recarga antes de que memoria de aplicación pueda mezclar el estado anterior con la nueva identidad.

Logout limpia sesión cloud y outbox, pero conserva el owner binding para detectar una cuenta distinta posteriormente.

## Política de cache

El Service Worker cachea únicamente una allow-list exacta y versionada del app shell.

Nunca se cachean de forma indiscriminada:

- `/api/*`;
- `/auth/*`;
- `/rest/v1/*`;
- RPC;
- paths de token/session/license/webhook;
- runtime configuration;
- build metadata;
- GET same-origin arbitrarios;
- navegaciones con estado operativo privado.

Las navegaciones son network-first/no-store y sólo usan el app shell precacheado como fallback offline. Al activar una generación nueva se eliminan caches Hípico anteriores.

El `CACHE_VERSION` permanece ligado a la versión de release (`1.13.0-rc2`) para conservar el contrato de #118; el schema local se versiona aparte mediante `LOCAL_SCHEMA_VERSION`.

## UI de confianza stale/offline

`offline-status.js` corre independientemente del orquestador principal. Expone un banner `role=status` cuando:

- el browser está offline;
- la última sincronización supera la ventana de frescura;
- la frescura no puede verificarse.

El wording indica explícitamente que los datos locales **no están confirmados como vigentes**.

## Conflictos

`sync.js` publica `SYNC_CONFLICT_POLICY`. Colecciones de entidades se mezclan por ID estable/registro más reciente; apuestas anidadas por ID; audit/movements conservan merge append-style. Dinero sigue siendo autoridad del ledger server-side y estado stale nunca se vuelve autoridad live.

Un workspace mezclado queda `merge-pending-confirmation` hasta que una sincronización autoritativa confirme la siguiente versión.

## Storage pressure / eviction

A >=90% de cuota, diagnostics reporta `quotaPressure=true`. Si un write falla por cuota se recortan snapshots antiguos a un piso de emergencia y se reintenta una sola vez sin crear snapshot adicional. Un segundo fallo devuelve `HIPICO_STORAGE_QUOTA_EXCEEDED`; nunca se descarta silenciosamente.

## Verificación

Contrato automatizado:

```bash
node --test tests/hipico_offline_sync_issue_115.test.mjs
node scripts/hipico-release-v118.mjs
```

Matriz runtime/browser aún necesaria sobre el candidate SHA:

- upgrade v1 → v2 con datos representativos;
- edición offline → reconnect;
- retry duplicado;
- cuenta A → logout → cuenta B;
- quota/eviction;
- Service Worker update con pestaña stale;
- hard refresh offline;
- paridad PWA/Android WebView.

Esos casos pertenecen al QA físico #119/#121 y se reportan `BLOCKED/NOT_EXECUTED` cuando no se ejecuten; no se convierten en PASS por inspección de source.

## Rollback

No bajar IndexedDB borrando la base. Un build anterior que sólo entienda schema v1 es incompatible después del upgrade a v2. Un rollback debe desplegar una versión que comprenda schema v2 y conservar el compatibility set de #118.
