# Conciliación bancaria v237

## Objetivo

El flujo canónico es `extracto → candidato(s) → match/write-off → confirmado`. El extracto original es evidencia inmutable; una conciliación nunca se consigue editando el raw ni asignando directamente un saldo bancario.

## Estados

### Línea de extracto

- `unmatched`: no existe asignación confirmada.
- `suggested`: existen candidatos y requieren decisión humana.
- `partial`: la suma de asignaciones confirmadas es menor que el valor absoluto de la línea.
- `reconciled`: la suma de asignaciones confirmadas coincide exactamente con la línea.
- `conflict`: los mejores candidatos tienen confianza equivalente y la decisión no es inequívoca.

### Conciliación

- `pending`: sólo se usa durante un write-off reanudable antes de confirmar su asiento.
- `confirmed`: efecto de conciliación vigente.
- `reversed`: evidencia preservada; deja de consumir saldo de línea/candidato.

## Importación y provenance

Formatos soportados: CSV, OFX, QFX y CAMT XML cuando el contenido es compatible con el parser conservador local. Cada importación conserva:

- bytes originales (`rawContent`), SHA-256, nombre y metadata de origen;
- parser y versión;
- representación normalizada por línea;
- representación `raw` de cada línea;
- uploader y timestamp.

El dedupe del archivo usa `(tenant, cuenta bancaria, SHA-256)`. El dedupe de líneas usa un hash canónico de ID bancario/fecha/monto/moneda/referencia/memo/contraparte. Reintentar el mismo archivo no duplica líneas.

El parser limita el archivo a 5 MiB, rechaza NUL/binarios, UTF-8 inválido detectable, CSV malformado y celdas de texto que comienzan con marcadores típicos de fórmula (`=`, `+`, `@`, tab o CR). CAMT rechaza `DOCTYPE` y `ENTITY` para impedir resolución de entidades externas.

## Matching explicable

Los candidatos se generan únicamente dentro del tenant activo contra:

- movimientos bancarios y transferencias;
- CxC/facturas de venta;
- CxP/facturas de compra;
- asientos contables posted.

Las razones actuales son visibles y ordenables: `exact_reference`, `partner_match`, `exact_remaining_amount`, `exact_amount`, `date_window_2d`, `date_window_7d`, `memo_reference`. La confianza es una señal de recomendación, no una autoridad contable.

El umbral explícito de auto-match está documentado como `0.9500`, pero v237 **no auto-confirma candidatos desde la UI**. Una baja confianza o empate permanece en revisión. Monedas distintas quedan bloqueadas como `FX_REQUIRES_EXPLICIT_POSTING`; no existe diferencia FX implícita.

## Partial, one-to-many y many-to-one

Cada confirmación contiene una o más allocations. El backend bloquea la línea con `FOR UPDATE`, calcula consumo confirmado y valida:

- suma de allocations <= pendiente de la línea;
- allocation <= pendiente del candidato;
- moneda exacta;
- target perteneciente al tenant.

Esto permite partial, una línea contra varios candidatos y varias líneas contra un mismo candidato sin doble consumo. `Idempotency-Key` es obligatorio; el mismo key recupera la conciliación original.

## Modelos recurrentes

`BankReconciliationModel` es versionado por `(tenant, nombre, versión)` y conserva patrón de memo, cuenta contable, reason code, `minConfidence` y si una política futura permite auto-apply. v237 crea y audita el modelo, pero mantiene la ejecución humana: no se introduce auto-reconcile de baja confianza.

## Write-offs y maker-checker

Un write-off requiere monto, cuenta de diferencia, cuenta contable bancaria, motivo y período fiscal. Nunca modifica `BankAccount.balance` directamente. El flujo es:

1. validar cuentas contables activas/posteables;
2. evaluar la policy maker-checker existente para `banking.correct`;
3. si aplica, exigir una solicitud aprobada cuyo payload/monto/moneda coincidan exactamente;
4. reservar una conciliación `pending` con idempotency key;
5. crear y postear el `LedgerEntry` canónico (`source=banking`, `sourceId=bank-reconciliation:<id>`);
6. marcar la conciliación `confirmed`, registrar allocation/event/audit y consumir la aprobación.

Si se pierde la respuesta, el retry con el mismo key encuentra la conciliación y el mismo `sourceId`, por lo que no debe producir un segundo asiento.

## Reversos

Unmatch/reversal no borra datos. Una conciliación normal pasa a `reversed`, libera matemáticamente la allocation y recalcula la línea. Cuando existe write-off, primero se crea el asiento inverso mediante el servicio contable; se conserva `reversalLedgerEntryId` y el evento de reverso.

## Closing balance

El reporte usa el `closingBalance` del extracto y el balance bancario persistido para producir:

`difference = statement closing balance - ledger/bank balance`

Todos los cálculos de dominio usan Decimal/Money de ContaGest. El reporte también expone cobertura (`firstDate`, `lastDate`, total de líneas y no conciliadas) para que gaps o líneas pendientes sean visibles; no se inventa un cierre cuando el formato no informa `closingBalance`.

## Seguridad y tenancy

Todas las rutas requieren tenant firmado, `banking.manage` y actor autenticado para mutaciones. Las consultas y mutaciones filtran por `tenantId` antes de aceptar IDs, por lo que un ID de tenant A se comporta como inexistente desde B. Los uploads no contienen scraping de credenciales ni conexiones bancarias online.

## API

Base: `/api/v1/bank-reconciliation`.

- `GET /imports`
- `POST /imports?accountId=...`
- `GET /lines?accountId=...&status=...`
- `GET /lines/:id/candidates`
- `GET /lines/:id/history`
- `POST /lines/:id/reconcile`
- `POST /lines/:id/write-off`
- `GET /models`
- `POST /models`
- `POST /reconciliations/:id/reverse`
- `GET /closing-balance?accountId=...&importId=...`

## QA v237

La evidencia obligatoria del gate incluye:

- parser: CSV válido/malicioso/malformed, OFX/QFX, CAMT y archivos corruptos/oversized;
- PostgreSQL efímero: duplicate import, tenant A→B, referencia exacta/mismatch, FX, partial, overpayment, one-to-many, many-to-one, response lost, concurrent reconcile, reversal, history, closing difference y rounding;
- PostgreSQL efímero para fee/write-off: modelos versionados, self-approval bloqueado, approval requerida, asiento balanceado, retry sin doble ledger y reverso contable;
- Chromium en PR para workspace, confidence/reasons/filtros, confirmación e importación full-file;
- matriz Chromium/Firefox/WebKit en ejecución programada, con trace/screenshot/video conservados por Playwright en fallos.

No se considera PASS por documentación: el estado final depende de los checks del SHA publicado.
