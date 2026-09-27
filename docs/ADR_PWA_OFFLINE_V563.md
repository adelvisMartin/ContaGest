# ADR · #563 PWA/offline tenant isolation and recovery

## Cache authority

The service worker caches only public shell/assets. `/api/*`, `/auth/*`, licenses, media and admin requests always bypass Cache Storage and use the network. Asset cache names carry a release version. Session cache names, when explicitly used, carry a non-reversible tenant+user scope token; raw identifiers are not written to cache names or logs.

An upgrade installs its complete asset shell before activation. It does **not** call `skipWaiting()` during install. The page promotes a fully installed waiting worker with `ACTIVATE_UPDATE`, and `controllerchange` performs one controlled reload, preventing old JavaScript and a new shell/backend from being mixed indefinitely. `RECOVER_CACHE` discards ContaGest caches and rebuilds the shell when corruption or an incompatible cache generation is detected.

## Tenant/user local state

The ERP Store is no longer persisted under one global key. State is scoped by a hashed tenant+user token. Unknown legacy unscoped state is deliberately not migrated because its tenant provenance cannot be proven. Login/switch rehydrates the target scope; logout and tenant switch purge the previous scoped Store, Cache Storage, session-sensitive storage and the scoped IndexedDB outbox.

## Offline state and outbox

Offline shell rendering is explicitly labelled `offline-stale`; reconnect is labelled `revalidating` until normal online state returns. Offline data is therefore never presented as server-confirmed simply because a cached shell rendered.

The outbox is deny-by-default. #563 currently allowlists only `analytics.event`, which is non-financial and already maps to the existing analytics API. Every record is scoped to tenant+user and keyed by operation + idempotency key, so a retry overwrites the same local intent instead of duplicating it. Generic sales, purchase, ledger, payment, fiscal or other financial mutations are not queueable. New operations require a reviewed allowlist entry and domain idempotency contract.

## Recovery and privacy

Logout clears local authentication metadata, the old scoped Store, session keys, scoped Cache Storage and the scoped IndexedDB database even if the backend logout endpoint is temporarily unreachable. Service-worker session messages contain only hashed scope values. Browser observability reports connectivity state without emails, RIFs, tokens or payloads.

## Verification

The PR gate runs a source contract, production frontend build and real Chromium tests against the Vite server. Browser tests cover service-worker install/recovery, offline/reconnect stale UI, logout purge, tenant scope switch and allowlisted/idempotent outbox behavior. The suite contains no sleeps, `force`, `skip` or `only` shortcuts.
