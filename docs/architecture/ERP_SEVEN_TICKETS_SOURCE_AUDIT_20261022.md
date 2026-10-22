# ContaGest ERP: auditoría de autoridad y hardening de siete tickets (2026-10-22)

**Baseline auditado**: `main@0b9a78a15e1eb8d9afeeee2f39d86b87a6ab0ca1`. Tickets: #743 #744 #753 #754 #755 #756 #757. **SOURCE_REUSE=NONE**.

## Incremento implementado (alcance acotado)

- **#743 Banking**: `bank-exception-window.ts` valida los identificadores tenant/account/line con tipo runtime `string`. Objetos coercibles por `toString` ya no producen evidencia. Sigue siendo una vista `PAGE_ONLY` con `reconciliationCertified:false`, no conciliación oficial.
- **#753 Sales**: `quote-order-snapshot-intent.ts` valida como `string` el actor/quote/client/line/product ID; no transforma referencias objetos en identidades. No crea SalesOrder ni reservas.
- **#754 Fulfillment**: `delivery-lifecycle-intent.ts` acepta únicamente claves de acción propias del FSM: `constructor`, `toString`, `__proto__` y acciones/estados de tipo no-string fallan. No persiste ni consume inventario.
- **#755 Inventory**: `lot-fefo-preflight.ts` excluye lotes cuya fecha de recepción UTC es posterior a `asOfDate`; mantiene elegibles los recibidos el mismo día. Solo preflight, sin modificación de stock.
- **#744 AR/AP, #756 Reorder, #757 Procurement**: se conservan sus authorities/read-models ya existentes; este incremento no finge cerrar sus gaps.

Las cuatro suites focales preexistentes reciben regresiones, incorporadas al comando `test:erp-input-integrity` y al `npm test` de `backend/package.json`.

## Mapa de autoridad y criterios materiales aún pendientes

| Ticket | Reutilización de authority | Bloqueo para Definition of Done |
|---|---|---|
| #743 | `bank-reconciliation.service.ts`, SQL de extractos/reconciliación, `accounting.service.ts` | PostgreSQL17 statement→match→reversal→GL, tenant A/B, permisos, browser, #643 |
| #744 | `open-item-coverage.ts`, `open-item-ageing-projection.mjs`, Sales/PurchaseInvoice | PaymentAllocation duradera, términos/snapshots, pagos parciales/credits/reversos, statements, dunning outbox, reconciliación GL #643 |
| #753 | `quote-order-transition-intent.ts`, `quote-order-snapshot-intent.ts`, `document-sequence.service.ts`, reservas #738 | Quote/SalesOrder duraderos, conversion CAS idempotente, numeración, reservations tenant-scoped, API E2E |
| #754 | `delivery-lifecycle-intent.ts`, `delivery-quantity-preflight.ts`, `consumeInventoryReservationForOwner` #738 | Delivery/DeliveryLine durable, transición/stock atómico, partial/backorder/reverso, PG17 |
| #755 | InventoryLot/Movement, FEFO preflight y reservas #738 | Location/bin, balances ledger por lote, transacciones FEFO/transferencias, PG17 y RBAC |
| #756 | `reports/reorder-scan-page.ts`, reposición/ageing read-models | Conciliación de stock contra ledger y locations, outbox de alertas, large dataset y permisos |
| #757 | `purchases/purchase-receipt-preflight.ts`, PurchaseInvoice/InventoryMovement | PurchaseOrder/Receipt durable, recepción exactamente una vez, AP bridge, compras concurrentes, PG17 |

En `backend/prisma/schema.prisma` del baseline auditado hay `SalesInvoice`, `PurchaseInvoice`, `InventoryLot`, `BankAccount`, `BankMovement`; **no** hay modelos Prisma `PaymentAllocation`, `SalesOrder`, `GoodsReceipt`, `InventoryLocation`. La conciliación bancaria ya usa migraciones SQL independientes: no inferir que faltan todas sus tablas a partir de Prisma.

## Evidencia y límites

- **VERIFIED local, copia exacta de los cuatro blobs TS publicados**: Node v22, nueve pruebas puras de regresión (9/9 PASS), y `tsc --noEmit --strict --target es2022 --module nodenext --moduleResolution nodenext --skipLibCheck` (PASS). No equivale a ejecución exacta de las cuatro suites remotas ni al monorepo completo.
- **NOT VERIFIED/BLOCKED**: instalación completa `pnpm install --frozen-lockfile`, lint/typecheck/build globales, PostgreSQL17 efímero desde cero y upgrade, transacciones concurrentes/retries/period lock, API/RBAC multi-tenant, conciliación #643, UI/E2E/Chromium/Firefox/WebKit, CI exact-SHA publicada, producción.
- **Riesgos**: entradas inválidas antes toleradas pasarán a error seguro; FEFO histórico ya no utilizará inventario recibido después del corte. Sin DDL, sin migraciones, sin efectos en pagos/stock/GL.
- **Estado**: **PARTIAL**. Mantener este PR como **DRAFT** y los siete issues **OPEN** hasta implementar y probar los flujos completos. No cerrar el backlog por un arreglo de preflight. Rollback mediante revert de los commits (sin reversión de datos).

## Ampliación posterior · 2026-10-22

- **#744:** `open-item-coverage.ts` ahora valida valores de factura no negativos y sin overflow `Decimal(18,2)` de los modelos Prisma actuales. No implica que el balance abierto sea calculable sin PaymentAllocation y vencimientos.
- **#756:** `reports/reorder-scan-page.ts` usa `Reflect.ownKeys` para rechazar claves desconocidas aunque sean no enumerables o símbolos. Conserva defaults, filtros propios y alcance `PAGE_ONLY`.
- **#757:** el contrato de recepción existente mantiene `persisted:false`; se incorporó su suite a la ejecución conjunta de siete tickets sin duplicar la autoridad de compras.
- **Evidencia actualizada:** [55/55 focales sobre Git blobs exactos](../qa/ERP_SEVEN_TICKETS_FOCAL_QA_20261022.md) y [matriz jurídica Venezuela](../compliance/VENEZUELA_ERP_AR_AP_BANKING_COMMERCIAL_MATRIX_20261022.md). Ambas dejan explícitamente el estado `PARTIAL / NOT_RELEASE_READY`.
- **Concurrencia de PR:** #1282 modifica `backend/package.json`, ruta que también edita #1283; revisar y conciliar ese archivo contra el HEAD actualizado antes de merge. Nunca sobrescribir scripts ajenos ni afirmar que el baseline histórico siga siendo HEAD.
- Los gates PG17, full backend build, API/RBAC/browser y GL permanecen **NOT_VERIFIED**. Revertir los commits implicados (no hay DDL); el texto anterior de «un único commit» correspondía al alcance inicial, no a esta ampliación.
