# ADR — Idempotencia financiera transversal (Issue #92)

- **Estado:** Accepted for v11.x hardening
- **Fecha:** 2026-08-27
- **Ámbito:** Financial Core / API / PostgreSQL
- **Issue:** #92

## Contexto

Las transacciones existentes de ventas, compras y bancos protegen la atomicidad dentro de un request, pero no distinguen un negocio nuevo de un retry técnico. Un timeout o reconexión podía repetir factura, asiento o movimiento bancario.

Las protecciones locales (`sourceId` determinista en algunos reversos) continúan siendo invariantes de negocio útiles, pero no constituyen por sí solas un contrato reutilizable de request/effect ni eliminan carreras concurrentes.

## Decisión

Toda mutación financiera que adopte este contrato usa:

`tenant autenticado + scope de servidor + Idempotency-Key opaca + hash canónico del request validado`.

El servidor persiste `IdempotencyRecord` en PostgreSQL. La reserva de la key, el efecto financiero y el guardado de su referencia ocurren dentro de la misma transacción.

### Identidad

- `tenantId` proviene exclusivamente del contexto autenticado del backend.
- `scope` es una constante del servidor; el cliente no lo elige.
- la key del cliente se valida y se almacena únicamente como SHA-256 (`keyHash`);
- el request validado se canonicaliza y se almacena únicamente como SHA-256 (`requestHash`);
- parámetros de ruta que identifican el recurso, como `saleId`/`purchaseId` en cancelaciones, forman parte del request canónico;
- no se almacena el payload original, tokens ni secretos.

### Concurrencia

La primera transacción intenta insertar `(tenantId, scope, keyHash)` con `ON CONFLICT DO NOTHING`.

PostgreSQL serializa la colisión mediante el unique index. Un request concurrente con la misma identidad espera la resolución de la primera transacción y luego:

1. si `requestHash` coincide y el estado es `succeeded`, reconstruye el resultado desde `resourceId` dentro del mismo tenant;
2. si el hash difiere, responde `409 IDEMPOTENCY_KEY_REUSED`;
3. si la primera transacción hace rollback, su reserva desaparece y el retry puede convertirse en propietario.

No existe una ventana en la que el efecto económico quede confirmado pero el registro idempotente se revierta por separado.

Las cancelaciones de ventas y compras añaden un `pg_advisory_xact_lock` derivado de `scope + tenantId + documentId`. Esto serializa incluso solicitudes concurrentes con **keys distintas** y evita que dos operaciones de anulación compitan al crear el mismo reverso.

## Scopes iniciales

- `sales.create`
- `sales.cancel`
- `purchases.create`
- `purchases.cancel`
- `banking.movements.create`
- `accounting.entries.create`

Los reversos de venta/compra quedan protegidos por la primitive y además conservan su `sourceId` determinista. La formalización completa del lifecycle universal de posting/reversal y la inmutabilidad del ledger continúa coordinada con #91.

Inventario no expone actualmente una ruta dedicada de `InventoryMovement` en el router API y `/imports` sólo tiene `preview`; no se inventan endpoints ni commits inexistentes. Esos consumidores deberán adoptar la primitive cuando existan sus mutaciones de efecto real.

## Política de compatibilidad

Durante esta fase de adopción el header es **opcional en servidor** para evitar romper clientes existentes. Sin header se ejecuta dentro de la misma frontera transaccional, se emite `idempotency.missing`, pero no existe deduplicación por key.

El cliente web oficial genera `Idempotency-Key` automáticamente para ventas/compras no draft, cancelaciones, movimientos bancarios y asientos manuales. Reutiliza la misma key en retry de red y retry posterior a refresh de sesión.

Además mantiene un registro single-flight en memoria para mutaciones financieras idénticas que estén simultáneamente en vuelo. Dos submits concurrentes con el mismo método + ruta + payload comparten la misma key; cuando ambas llamadas terminan la key se libera. Un consumidor que realmente necesite dos operaciones idénticas concurrentes puede suministrar keys explícitas distintas.

Esta compatibilidad es transitoria: clientes legacy sin key no obtienen garantía general de retry seguro. La obligatoriedad universal debe activarse sólo cuando telemetría y consumidores externos demuestren adopción suficiente.

## Retención

`expiresAt` es nullable y los registros financieros nacen sin expiración automática. No se ejecuta cleanup que pueda volver a habilitar una operación duplicada.

Una futura política de retención sólo podrá expirar keys si existe evidencia de que la ventana de replay ya no puede producir un duplicado empresarial o si una constraint de negocio duradera conserva la misma garantía.

## Respuesta reconstruible

Para ventas, compras, cancelaciones, movimientos bancarios y asientos manuales no se persiste un snapshot financiero completo: `responsePayload` queda `NULL` cuando existe callback de reconstrucción.

Se conserva únicamente:

- `resourceType`;
- `resourceId`;
- `responseCode`;
- `requestId` original;
- `lastRequestId`;
- `hitCount`;
- timestamps.

En un replay, cada consumidor vuelve a consultar el recurso mediante `resourceId + tenantId` y reconstruye la forma pública de la respuesta. Si el recurso ya no existe, responde `409 IDEMPOTENCY_RESULT_UNAVAILABLE`; nunca responde datos de otro tenant ni inventa un resultado.

La primitive mantiene un fallback de `responsePayload` para futuros consumidores sin reconstrucción explícita, pero los flujos financieros iniciales no lo usan.

## Observabilidad

Eventos estructurados, sin key raw ni payload:

- `idempotency.miss`
- `idempotency.hit`
- `idempotency.conflict`
- `idempotency.concurrent_wait` cuando la reserva queda bloqueada por una colisión concurrente apreciable
- `idempotency.failed`
- `idempotency.missing`

Los replays exitosos generan además evidencia `idempotency.replay` en `AuditLog` para ventas, compras, cancelaciones, bancos y asientos manuales.

## QA / CI

La suite `qa/financial-idempotency-v92.test.ts` prueba PostgreSQL real con concurrencia 2/5/20, rollback, retry posterior, separación de tenants/scopes, conflictos de payload y reversos concurrentes. El script `test:backend:commercial:real` incluye esta suite para que el workflow PostgreSQL E2E ya existente la ejecute sin depender de un workflow nuevo.

## Seguridad

- key: 8–200 caracteres ASCII seguros;
- tenant: sólo contexto autenticado;
- scope: sólo servidor;
- hashes SHA-256 en persistencia;
- los flujos financieros iniciales no persisten snapshots sensibles de respuesta;
- reconstrucción de replay filtrada por `resourceId + tenantId`;
- cancelaciones serializadas por advisory lock tenant/document-scoped;
- CORS permite `Idempotency-Key` únicamente dentro de la política de orígenes existente;
- rate limits existentes siguen aplicando;
- idempotencia no sustituye RBAC, aislamiento tenant, período abierto, balance contable ni constraints de negocio.

## Rollback

El cambio de datos es aditivo. Para rollback de aplicación puede revertirse el consumo de la primitive manteniendo la tabla como evidencia histórica. Eliminar `IdempotencyRecord` no es un rollback seguro automático porque descartaría evidencia de operaciones ya ejecutadas; cualquier eliminación posterior requiere decisión de retención explícita.

## Consecuencias

### Positivas

- retries razonables pueden devolver el mismo resultado sin repetir el efecto;
- double-submit concurrente del cliente oficial comparte key;
- cancelaciones concurrentes no duplican reversos incluso si reciben keys distintas;
- la semántica es consistente entre módulos;
- conflictos de key/payload son detectables;
- existe correlación entre request original y replay;
- la constraint de concurrencia vive en PostgreSQL, no sólo en memoria del proceso;
- los consumidores financieros iniciales minimizan datos persistidos al reconstruir la respuesta desde la entidad.

### Costes / riesgo residual

- cada replay reconstruido requiere una lectura del recurso y, en ventas/compras, una lectura de su asiento/reverso asociado;
- clientes legacy sin header siguen fuera de la garantía general durante la transición;
- #90 (Money/Decimal) y #91 (posting/ledger inmutable) siguen siendo dependencias complementarias, no absorbidas por este ADR;
- exactly-once distribuido con proveedores externos permanece fuera de alcance.
