# Control Hípico · PWA

## Alcance

La PWA se publica bajo `/hipico-control/` con identidad y cache propios. No comparte nombres de cache con ContaGest.

## Manifest

`frontend/public/hipico-control/manifest.webmanifest` define `Control Hípico`, modo standalone, scope propio, iconos `any` y `maskable`, y shortcuts hacia Resumen, Captura, Participantes y Cierres.

## Service worker

`frontend/public/hipico-control/sw.js` usa una versión explícita para shell/runtime. Estrategias:

- navegación: network-first con fallback al shell;
- assets estáticos: stale-while-revalidate;
- endpoints sensibles (`api`, `auth`, `session`, `license`, `webhook`): solo red, nunca cache;
- activación: elimina caches de versiones anteriores y notifica clientes.

## Offline

IndexedDB es la base de operación local. El UI distingue Offline, Pendiente y Local listo. Capturas offline crean un item de outbox idempotente; no se afirma sincronización cloud hasta que exista confirmación remota.

## Actualización y rollback

Cada versión del service worker cambia `VERSION`. La activación limpia caches anteriores del producto. El rollback se realiza desplegando un SHA anterior con una versión de SW coherente y sin borrar IndexedDB automáticamente.
