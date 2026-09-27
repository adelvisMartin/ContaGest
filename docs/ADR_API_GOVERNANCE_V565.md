# ADR · #565 Gobierno de contratos HTTP

## Autoridad

La API de producto permanece bajo `/api/v1/*`. `backend/src/shared/contracts/api-contract-v1.json` define reglas machine-readable de representación, error envelope, paginación, idempotencia, webhook replay y breaking changes. `scripts/generate-api-inventory-v565.mjs` escanea las declaraciones de rutas del runtime, el module route manifest y los mounts de `app.ts`; cada ejecución produce un inventario exact-SHA y un fingerprint para comparar cambios.

El inventario generado es evidencia, no documentación escrita a mano: si desaparecen los mounts canónicos `/api/v1` o `/api/v1/hipico`, la generación falla cerrada.

## Error envelope

Errores HTTP canónicos exponen `ok=false`, `message` y `requestId`; `code` y `details` son opcionales. Los errores internos no controlados ya no devuelven `error.message` en 5xx y los errores de conexión no devuelven ejemplos/configuración de `DATABASE_URL`. Stack traces sólo se permiten en `NODE_ENV=development`.

## Versionado y breaking changes

Eliminar/renombrar un endpoint, cambiar semántica o representación incompatible exige un nuevo major o una compatibility layer explícita. Añadir campos opcionales/endpoints puede permanecer en v1 si no rompe consumidores existentes. El fingerprint del inventario permite revisar el delta exacto en PR/RC.

## Hípico y deprecación

`/api/v1/hipico/*` es la API canónica de producto. El provider adapter histórico bajo `/api/v1/hipico-bot/providers*` conserva compatibilidad pero publica `Deprecation: true` y `Link: ... rel="successor-version"` hacia `/api/v1/hipico/providers`. No se inventa una fecha legal/comercial de retiro: `Sunset` sólo aparece cuando `HIPICO_LEGACY_PROVIDER_SUNSET` ha sido aprobada/configurada; la ausencia de fecha significa que la retirada todavía no está autorizada.

## Paginación, Decimal e idempotencia

La ventana transversal usa `take/skip`, con los límites documentados por #564 y headers de ventana efectiva. IDs se representan como UUID string, fechas como ISO-8601 UTC y los dominios financieros deben preservar Decimal canónico (con companions exactos donde el contrato legado aún conserva números). Las mutaciones con efectos financieros/inventario/outbox usan `Idempotency-Key`: el mismo tenant+scope+key+request reproduce el efecto original; una carga distinta falla cerrada.

## Webhooks

Los webhooks requieren autenticidad de firma sobre raw body y deduplicación de identidad del evento antes de producir efectos. El adapter no convierte eventos repetidos en dobles efectos.

## Verificación

El workflow genera el inventario para el SHA candidato, ejecuta contracts, typecheck/lint/build y sube artifacts. Que un workflow exista o esté queued/skipped no constituye PASS; sólo cuentan logs/artifacts del SHA exacto.
