# Guía de estudio — Hípico #115: Offline/PWA Sync seguro

## Objetivo mental

Una PWA local-first debe seguir funcionando con mala conexión sin convertir el estado local en autoridad falsa. La idea central es separar **disponibilidad** de **confirmación**.

```text
offline/local state != server-confirmed state
```

## 1. IndexedDB versionada

El schema local tiene versión propia. `DB_VERSION=2` habilita migraciones de IndexedDB y `LOCAL_SCHEMA_VERSION=2` etiqueta datos/snapshots.

La migración debe ser aditiva: conservar workspaces, settings, outbox y snapshots compatibles. Un snapshot futuro se rechaza en vez de abrirse a ciegas.

## 2. Outbox idempotente

Una mutación offline debe tener identidad estable. Si el usuario reintenta después de reconnect, la misma intención no debe producir dos efectos.

```text
intención estable -> idempotencyKey estable -> un registro de outbox
```

El índice único de `idempotencyKey` protege incluso contra dos inserts concurrentes.

## 3. Stale no es live

`lastSyncedAt` permite calcular frescura. Si no existe timestamp válido o supera el umbral, la UI debe mostrar estado stale.

Nunca presentar saldo/resultado stale como recién confirmado. `offline-status.js` lo comunica mediante un banner accesible `role=status`.

## 4. Cambio de identidad

En un dispositivo compartido, cambiar de cuenta puede mezclar datos privados si sólo se reemplaza el token.

El flujo seguro es:

```text
flush writes
-> archivar workspace anterior
-> eliminar primary
-> limpiar outbox/snapshots privados
-> bind nuevo owner
-> reload
```

Logout conserva el owner binding para detectar que el siguiente login pertenece a otra persona.

## 5. Cache del Service Worker

Cachear todo GET es peligroso. El SW usa allow-list exacta del app shell.

Network/no-store para:

- API/auth;
- REST/RPC;
- tokens/sesiones;
- runtime config;
- build metadata;
- recursos same-origin no autorizados.

La navegación es network-first y sólo usa shell precacheado como fallback offline.

## 6. Versiones independientes

Hay dos conceptos distintos:

- versión de release/PWA: `1.13.0-rc2`;
- versión del schema local: `2`.

No deben mezclarse. #118 exige que `CACHE_VERSION` siga exactamente la versión de release; IndexedDB mantiene su propia compatibilidad.

## 7. Conflictos

No todas las entidades se resuelven igual. `SYNC_CONFLICT_POLICY` documenta la política por colección. Para dinero, la regla es explícita:

```text
moneyAuthority = server-ledger-only
staleAuthority = never-live
```

Un merge local/remoto queda pendiente de confirmación hasta sincronización autoritativa.

## 8. Quota pressure

`QuotaExceededError` no debe perder datos silenciosamente. Se intenta recuperación acotada eliminando snapshots antiguos y se reintenta una vez. Si vuelve a fallar, se emite `HIPICO_STORAGE_QUOTA_EXCEEDED`.

## 9. Qué verificar

Automatizable:

- schema v2;
- índice idempotente;
- identity isolation;
- cache allow-list;
- stale wording;
- conflict policy;
- quota handling.

En browser/device:

- upgrade v1→v2;
- offline→reconnect;
- retry duplicado;
- cuenta A→B;
- PWA update con tab stale;
- hard refresh offline;
- Android WebView.

## 10. IMPLEMENTED vs VERIFIED

`IMPLEMENTED` significa que el contrato está conectado a la aplicación.

`VERIFIED` exige ejecutar los escenarios reales correspondientes sobre el SHA candidato. Los escenarios físicos pertenecen a #119/#121 y no deben mantener duplicado el ticket de implementación una vez integrado en `main`.

## Preguntas de repaso

1. ¿Por qué un cache-first general para todo GET puede filtrar información privada?
2. ¿Qué diferencia existe entre DB_VERSION y versión de release?
3. ¿Por qué un outbox necesita idempotencyKey única?
4. ¿Qué estado debe mostrar un saldo offline?
5. ¿Qué debe limpiarse al cambiar de usuario en un dispositivo compartido?
6. ¿Por qué un error de cuota debe ser observable?
7. ¿Qué autoridad conserva el ledger server-side durante conflictos?
