# ADR — Idempotencia financiera transversal (Issue #92)

- **Estado:** Accepted for v11.x hardening
- **Fecha:** 2026-08-27
- **Ámbito:** Financial Core / API / PostgreSQL
- **Issue:** #92

## Contexto

Las transacciones existentes de ventas, compras y bancos protegen la atomicidad dentro de un request, pero no distinguen un negocio nuevo de un retry técnico. Un timeout o reconexión podía repetir factura, asiento o movimiento bancario.

Las protecciones locales (`sourceId` determinista en algunos reversos) continúan siendo invariantes de negocio útiles, pero no constituyen un contrato reutilizable de request/effect.

## Decisión

Toda mutación financiera que adopte este contrato usa:

`tenant autenticado + scope de servidor + Idempotency-Key opaca + hash canónico del request validado`.

El servidor persiste `IdempotencyRecord` en PostgreSQL. La reserva de la key, el efecto financiero y el guardado del resultado ocurren dentro de la misma transacción.

### Identidad

- `tenantId` proviene exclusivamente del contexto autenticado del backend.
- `scope` es una constante del servidor; el cliente no lo elige.
- la key del cliente se valida y se almacena únicamente como SHA-256 (`keyHash`);
- el request validado se canonicaliza y se almacena únicamente como SHA-256 (`requestHash`);
- no se almacena el payload original, tokens ni secretos.

### Concurrencia

La primera transacción intenta insertar `(tenantId, scope, keyHash)` con `ON CONFLICT DO NOTHING`.

PostgreSQL serializa la colisión mediante el unique index. Un request concurrente con la misma identidad espera la resolución de la primera transacción y luego:

1. si `requestHash` coincide y el estado es `succeeded`, reutiliza `responsePayload`;
2. si el hash difiere, responde `409 IDEMPOTENCY_KEY_REUSED`;
3. si la primera transacción hace rollback, su reserva desaparece y el retry puede convertirse en propietario.

No existe una ventana en la que el efecto económico quede confirmado pero el registro idempotente se revierta por separado.

## Scopes iniciales

- `sales.create`
- `purchases.create`
- `banking.movements.create`
- `accounting.entries.create`

Los reversos de ventas/compras conservan por ahora su protección específica `sourceId`; la formalización completa del lifecycle de posting/reversal sigue coordinada con #91.

Inventario no expone actualmente una ruta dedicada de `InventoryMovement` en el router API y `/imports` sólo tiene `preview`; no se inventan endpoints ni commits inexistentes. Esos consumidores deberán adoptar la primitiva cuando existan sus mutaciones de efecto real.

## Política de compatibilidad

Durante esta fase de adopción el header es **opcional en servidor** para evitar romper clientes existentes. Sin header se ejecuta el comportamiento legacy y se emite `idempotency.missing`.

El cliente web oficial genera `Idempotency-Key` automáticamente para ventas/compras no draft, creación de movimientos bancarios y asientos manuales. Reutiliza la misma key en retry de red y retry posterior a refresh de sesión.

Esta compatibilidad es transitoria: clientes legacy sin key no obtienen garantía de retry seguro. La obligatoriedad universal debe activarse sólo cuando telemetría y consumidores externos demuestren adopción suficiente.

## Retención

`expiresAt` es nullable y los registros financieros nacen sin expiración automática. No se ejecuta cleanup que pueda volver a habilitar una operación duplicada.

Una futura política de retención sólo podrá expirar keys si existe evidencia de que la ventana de replay ya no puede producir un duplicado empresarial o si una constraint de negocio duradera conserva la misma garantía.

## Respuesta almacenada

Se persiste únicamente la respuesta necesaria para reproducir el resultado lógico, junto con:

- `resourceType`;
- `resourceId`;
- `responseCode`;
- `requestId` original;
- `lastRequestId`;
- `hitCount`;
- timestamps.

## Observabilidad

Eventos estructurados, sin key raw ni payload:

- `idempotency.miss`
- `idempotency.hit`
- `idempotency.conflict`
- `idempotency.failed`
- `idempotency.missing`

Los replays exitosos generan además evidencia `idempotency.replay` en `AuditLog` para ventas, compras, bancos y asientos manuales.

## Seguridad

- key: 8–200 caracteres ASCII seguros;
- tenant: sólo contexto autenticado;
- scope: sólo servidor;
- hashes SHA-256 en persistencia;
- CORS permite `Idempotency-Key` únicamente dentro de la política de orígenes existente;
- rate limits existentes siguen aplicando;
- idempotencia no sustituye RBAC, aislamiento tenant, período abierto, balance contable ni constraints de negocio.

## Rollback

El cambio de datos es aditivo. Para rollback de aplicación puede revertirse el consumo de la primitiva manteniendo la tabla como evidencia histórica. Eliminar `IdempotencyRecord` no es un rollback seguro automático porque descartaría evidencia de operaciones ya ejecutadas; cualquier eliminación posterior requiere decisión de retención explícita.

## Consecuencias

### Positivas

- retries razonables pueden devolver el mismo resultado sin repetir el efecto;
- la semántica es consistente entre módulos;
- conflictos de key/payload son detectables;
- existe correlación entre request original y replay;
- la constraint de concurrencia vive en PostgreSQL, no sólo en memoria del proceso.

### Costes / riesgo residual

- una respuesta reducida ocupa almacenamiento adicional;
- clientes legacy sin header siguen fuera de la garantía durante la transición;
- #90 (Money/Decimal) y #91 (posting/ledger inmutable) siguen siendo dependencias complementarias, no absorbidas por este ADR;
- exactly-once distribuido con proveedores externos permanece fuera de alcance.
