# API — Idempotencia financiera v92

## Contrato

Los clientes que quieran retry seguro deben enviar una key opaca y estable para **un único request lógico**:

```http
Idempotency-Key: cg-550e8400-e29b-41d4-a716-446655440000
```

La key no identifica al tenant. El tenant se obtiene de la sesión/autenticación del servidor.

## Endpoints integrados

| Endpoint | Scope de servidor | Cliente web oficial |
| --- | --- | --- |
| `POST /api/v1/sales` (status distinto de `draft`) | `sales.create` | key automática |
| `PATCH /api/v1/sales/:id/cancel` | `sales.cancel` | key automática |
| `POST /api/v1/purchases` (status distinto de `draft`) | `purchases.create` | key automática |
| `PATCH /api/v1/purchases/:id/cancel` | `purchases.cancel` | key automática |
| `POST /api/v1/banking/movements` | `banking.movements.create` | key automática |
| `POST /api/v1/accounting/entries` | `accounting.entries.create` | key automática |

Los drafts pueden seguir creándose sin key. Si un consumidor suministra key, la primitive puede proteger también el request, pero la obligación funcional de #92 se centra en efectos financieros.

En cancelaciones, el `:id` del documento se incorpora al request canónico. Reutilizar la misma key para cancelar otro documento produce conflicto aunque el body sea idéntico.

## Reglas

### Mismo tenant + scope + key + mismo request

El servidor devuelve el resultado lógico original y no vuelve a ejecutar el efecto. En los scopes financieros iniciales la respuesta se reconstruye desde `resourceId` usando siempre el tenant autenticado; no se persiste un snapshot financiero completo.

Respuesta adicional:

```http
Idempotency-Replayed: true
```

En el primer intento o en un request legacy sin replay:

```http
Idempotency-Replayed: false
```

### Misma key con payload materialmente distinto

```http
HTTP/1.1 409 Conflict
Content-Type: application/json
```

```json
{
  "ok": false,
  "message": "Idempotency-Key ya fue utilizada con un request diferente.",
  "details": {
    "code": "IDEMPOTENCY_KEY_REUSED",
    "scope": "banking.movements.create"
  }
}
```

### Resultado histórico no reconstruible

Si el registro idempotente existe pero el recurso original fue eliminado por una política independiente, el servidor no ejecuta el efecto otra vez y tampoco inventa una respuesta:

```http
HTTP/1.1 409 Conflict
```

```json
{
  "ok": false,
  "message": "El movimiento bancario original ya no puede reconstruirse.",
  "details": {
    "code": "IDEMPOTENCY_RESULT_UNAVAILABLE",
    "scope": "banking.movements.create"
  }
}
```

### Key inválida

La key debe tener entre 8 y 200 caracteres y usar caracteres ASCII seguros (`A-Z`, `a-z`, `0-9`, `.`, `_`, `~`, `:`, `+`, `/`, `=`, `-`).

Una key inválida devuelve `400` con `details.code = IDEMPOTENCY_KEY_INVALID` antes de ejecutar el efecto.

## Canonicalización del request

El hash se calcula sobre el request **después de validación Zod**, no sobre bytes HTTP crudos.

- claves de objetos ordenadas;
- arrays conservan orden;
- fechas usan ISO 8601;
- `-0` se normaliza a `0`;
- valores `undefined` de objetos se omiten;
- números no finitos son rechazados;
- parámetros de ruta relevantes se incorporan explícitamente en operaciones como cancelación.

Esto permite que representaciones equivalentes produzcan el mismo hash sin ignorar diferencias económicas materiales.

## Retry recomendado

1. El cliente crea una key para la acción del usuario.
2. Envía el request.
3. Si pierde la respuesta por red/timeout, reintenta **con la misma key y el mismo payload lógico**.
4. Si recibe `409 IDEMPOTENCY_KEY_REUSED`, no debe generar automáticamente una key nueva para el payload distinto; debe tratarlo como conflicto de programación/estado del cliente.

El cliente web de ContaGest reutiliza la misma key en su retry de red y cuando un `401` provoca refresh de sesión y reenvío del request.

También usa single-flight para submits financieros idénticos que están simultáneamente en curso: mismo método + ruta + payload comparte una key hasta que todas esas llamadas terminan. Esto cubre el caso práctico de double-click concurrente. Si una integración necesita ejecutar dos operaciones deliberadamente idénticas al mismo tiempo, debe proporcionar keys explícitas distintas.

## Cancelaciones y reversos

`PATCH /sales/:id/cancel` y `PATCH /purchases/:id/cancel` usan idempotencia por key y además un advisory lock transaccional por `tenant + documento`.

Esto evita una carrera incluso cuando dos consumidores envían keys distintas: sólo una transacción puede evaluar y crear el reverso a la vez; la siguiente observa el documento ya cancelado y reutiliza el reverso existente.

## Compatibilidad temporal sin key

La versión inicial no rompe clientes legacy: si el header falta, el backend ejecuta la operación y registra `idempotency.missing`.

**Importante:** un request sin key no obtiene garantía general de deduplicación por retry. Las cancelaciones sí conservan protección adicional mediante lock por documento y `sourceId` determinista. Esta compatibilidad debe retirarse en una versión posterior cuando los consumidores hayan migrado.

## Tenant isolation

Una key idéntica puede existir en tenants distintos porque la constraint es:

```text
(tenantId, scope, keyHash)
```

El cliente nunca envía `tenantId` como parte autorizante del contrato. Todo lookup y toda reconstrucción de replay usan el tenant resuelto por el servidor.

La misma key también puede reutilizarse en scopes distintos sin colisión, porque el scope de operación forma parte de la identidad persistida.

## Persistencia y privacidad

No se guarda:

- key raw;
- request body raw;
- cookies;
- tokens;
- Authorization header;
- snapshot financiero completo de ventas, compras, cancelaciones, movimientos bancarios o asientos manuales.

Se guarda hash SHA-256 de key/request, estado, `resourceType`, `resourceId`, código HTTP y metadatos de correlación. En los consumidores con callback de replay `responsePayload` queda `NULL` y la respuesta se reconstruye desde la entidad del tenant.

## Retención

Los registros financieros se crean con `expiresAt = null`. No existe cleanup automático en esta versión.

## Observabilidad

Eventos esperados:

```text
idempotency.miss
idempotency.hit
idempotency.conflict
idempotency.concurrent_wait
idempotency.failed
idempotency.missing
```

`idempotency.concurrent_wait` se emite cuando la colisión de reserva hace esperar apreciablemente a un retry concurrente. Los logs no incluyen la key completa ni snapshots sensibles.

## QA en PostgreSQL real

`qa/financial-idempotency-v92.test.ts` cubre:

- 20 retries concurrentes de venta → una factura y un asiento;
- 20 retries concurrentes de cancelación de venta → un reverso;
- 5 retries concurrentes de compra → una factura y un asiento;
- cancelación de compra con keys distintas → un único reverso gracias al lock por documento;
- 20 movimientos bancarios concurrentes → una modificación de saldo;
- 2 postings manuales concurrentes → un asiento;
- misma key + payload distinto → `409` tipado;
- rollback antes de commit + retry posterior;
- replay después de perder la primera respuesta;
- separación tenant A/B;
- misma key en scopes distintos;
- key malformada;
- `responsePayload = NULL` para replay reconstruible.

El script existente `test:backend:commercial:real` ejecuta también esta suite, por lo que el workflow PostgreSQL E2E existente la incluye cuando los runners de GitHub Actions están disponibles.

## Nuevos módulos

Para integrar otra mutación financiera:

1. definir un scope constante y específico;
2. pasar el tenant del contexto autenticado;
3. usar el request ya validado como entrada del hash;
4. incluir parámetros de ruta que cambien la identidad lógica del request;
5. ejecutar **todo** el efecto dentro del `TransactionClient` recibido por `runFinancialIdempotentMutation`;
6. devolver `resourceType/resourceId` cuando exista;
7. preferir un callback `replay` que reconstruya la respuesta con `resourceId + tenantId` en lugar de persistir snapshots;
8. añadir pruebas de misma key/mismo payload, key reutilizada con payload distinto, concurrencia, scopes distintos y tenant isolation;
9. añadir un lock/constraint de negocio cuando distintas keys todavía puedan representar la misma operación irreversible;
10. no reemplazar constraints de negocio existentes.

## OpenAPI

En el `main` auditado para #92 no se encontró un spec/generador OpenAPI canónico que pueda actualizarse sin inventar una fuente nueva. Este documento es la documentación API implementada para el contrato actual. Cuando el repositorio adopte un OpenAPI canónico, `Idempotency-Key`, `Idempotency-Replayed` y los errores tipados anteriores deben incorporarse al spec.
