# ADR · #563 PWA/offline tenant-safe

## Estado

Accepted para la autoridad transversal de PWA/offline. El outbox específico de Control Hípico continúa bajo #545 y no se duplica aquí.

## Invariantes

1. Los responses `/api/*`, auth, licenses, media privada y administración nunca se guardan en Cache Storage.
2. El shell estático usa namespace por versión (`contagest-ve-shell-v563`). Los artefactos de sesión usan namespace por `version + tenantId + userId`.
3. Logout y cambio de tenant purgan el namespace de la sesión anterior y su outbox IndexedDB antes de continuar.
4. Una sesión nunca puede reconstruir un namespace de otro tenant a partir de parámetros de UI: el contexto procede de `AuthSession`/respuesta autenticada.
5. Offline no equivale a confirmado. `data-offline-freshness=stale` y el banner accesible indican que lo visible puede estar desactualizado.
6. No existe outbox genérico para mutaciones financieras. Sólo `ALLOWLISTED_OUTBOX_OPERATIONS` admite operaciones explícitas no financieras y toda entrada exige `idempotencyKey`.

## Outbox y resolución de conflictos

La clave física del outbox combina `tenant:user:operation:idempotencyKey`; un retry reemplaza la misma entrada y no crea una segunda operación. El payload local no confiere autoridad: al reconectar el servidor vuelve a autenticar, autorizar y validar. Si el estado del servidor cambió, la operación debe fallar y volver a una UI de conflicto; el cliente no puede hacer last-write-wins para operaciones monetarias ni saltarse domain services.

Las únicas operaciones allowlisted inicialmente son preferencias de perfil, borrador de nota de tareas y borrador de soporte. Ledger, pagos, asientos, fiscal, banking, ventas emitidas y cualquier mutación monetaria quedan fuera de esta autoridad offline.

## Service Worker update / activate / rollback

El worker nuevo se instala sin `skipWaiting` automático. Una actualización instalada con controller previo emite `cg:pwa-update-ready`; la activación es explícita mediante `CG_ACTIVATE_UPDATE`. `activate` elimina shells viejos y namespaces de sesión de versiones anteriores antes de reclamar clientes. Scripts y estilos son network-first para impedir mezclar un bundle viejo con un backend nuevo.

`CG_RECOVER_CACHE` elimina la familia de caches ContaGest y reconstruye el app shell actual. Esto actúa también como rollback operativo ante cache corrupta: se vuelve a una copia coherente del shell de la versión desplegada, no a assets parciales de dos versiones.

## IndexedDB recovery

`contagest-offline-v563` tiene esquema versionado. Si abrir la versión soportada falla —por corrupción o versión incompatible— el recovery elimina sólo esa base local offline y la recrea. No toca PostgreSQL ni intenta reconstruir autoridad de negocio desde el navegador.

## Logout / tenant switch

`AuthService.logout()` guarda la identidad anterior, limpia la metadata local, purga Cache Storage/IndexedDB de esa sesión y luego intenta invalidar la cookie HttpOnly en backend. Si la red está caída, los artefactos locales sensibles ya quedaron purgados.

`AuthService.switchTenant()` conserva la sesión anterior únicamente hasta recibir una respuesta autenticada válida del tenant destino; si cambia `tenantId`, purga primero los artefactos del tenant anterior y sólo después instala el nuevo contexto de PWA.

## Stale/fresh UX

Los eventos `online`/`offline` actualizan una live region `role=status`, visible mientras está offline. No se presenta contenido stale como confirmado. Al reconectar, la marca cambia a `fresh`; cada módulo sigue siendo responsable de refrescar/reconciliar su dominio antes de confirmar cambios pendientes.

## Mobile, install y deep-link

El registro usa `/sw.js` con scope `/`. El shell conserva navegación/deep-link por network-first con fallback de `/index.html`; el manifest existente sigue controlando instalación. Back-button y query/deep-link continúan bajo `UrlStateService`; #563 no introduce un router paralelo.

## Observabilidad y privacidad

Los eventos del runtime sólo publican `fresh`, motivo de purge y versión; no registran email, payload de outbox, cookies, tokens ni otros PII/secrets. `tenantId/userId` sólo se usan localmente para namespace/purge y no se escriben en logs del worker.

## Verificación

El contrato estático prohíbe ampliar el allowlist a categorías financieras y exige hooks de sesión/recovery. La prueba Playwright real cubre tenant A→B, logout, dedupe por idempotency key, offline/reconnect, Service Worker registrado, deep-link y recuperación de Cache Storage/IndexedDB. No usa sleeps, `force`, `.skip` ni `.only`.
