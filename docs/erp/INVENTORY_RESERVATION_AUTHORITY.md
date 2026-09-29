# Inventory Reservation Authority

**Issue:** #738  
**Parent:** #708 / #707 / #624  
**Baseline:** `main@9957bad6dade194cb6f75bbe4d1d3807a8c8df4a`  
**SOURCE_REUSE=NONE**

## Why this exists

ContaGest already had the correct core primitives for reservations: exact-decimal quantities, `Product.stock`, `Product.reserved`, immutable `InventoryMovement` rows, tenant ownership, row locking, idempotent financial mutations and audit logging. The missing invariant was ownership: a generic `release` could reduce the global reserved aggregate without proving which business document originally reserved the quantity, and a normal `out` correctly refused to consume stock that was still reserved.

This change keeps the existing stock ledger as the single authority and adds an owner-scoped lifecycle on top of it. It does not create a parallel reservation table or a vertical-specific inventory ledger.

## OSS benchmark

| Reference | Observed pattern | ContaGest baseline | Decision | License/reuse |
| --- | --- | --- | --- | --- |
| ERPNext v15+ Stock Reservation | Reservation entries are tied to sales-order/pick-list context; stock can be explicitly reserved/unreserved and fulfillment updates reservation state | `PARTIAL` | Reimplement the owner/lifecycle invariant over existing `InventoryMovement`; do not copy source | GPL-3.0 · `SOURCE_REUSE=NONE` |
| Tryton Stock | Assigning a shipment finds and reserves stock specifically for that shipment before picking/dispatch; unassignment is an explicit operation | `PARTIAL` | Reimplement shipment/document ownership semantics while preserving ContaGest's ledger and exact-decimal model | GPL family · `SOURCE_REUSE=NONE` |

Sources reviewed 2026-09-29:
- ERPNext documentation: `https://docs.frappe.io/erpnext/stock-reservation`
- ERPNext sales flow: `https://docs.frappe.io/erpnext/sales-order`
- Tryton stock usage: `https://docs.tryton.org/latest/modules-stock/usage/`
- Tryton stock move/assignment design: `https://docs.tryton.org/6.0/modules-stock/design/move.html`

No GPL/AGPL code is incorporated into ContaGest.

## Authority and invariants

The authority remains:

```text
Product.stock / Product.reserved      materialized aggregates
             ^
             |
InventoryMovement                     immutable inventory ledger
             ^
             |
Inventory reservation service         owner-scoped domain rules
             ^
             |
Inventory API / ERP verticals         application boundary
```

A reservation owner is the canonical tuple:

```text
(tenantId, productId, source, sourceId)
```

`source` is normalized to lowercase and `sourceId` is an opaque document identifier. The current outstanding quantity is derived, never stored separately:

```text
outstanding = Σ reservation - Σ release
```

Only movements for the same tenant, product and owner participate in that calculation.

### Reserve

- lock the tenant product with `FOR UPDATE`;
- require a canonical owner;
- enforce `stock - reserved >= quantity`;
- increment `Product.reserved`;
- append an owner-linked `reservation` movement.

### Release

- lock the tenant product;
- derive the owner's outstanding reservation;
- reject a release larger than that owner's outstanding quantity even if another owner has stock reserved;
- decrement `Product.reserved`;
- append an owner-linked `release` movement.

### Consume reservation

`POST /inventory/reservations/consume` performs the fulfillment-side stock effect in one idempotent transaction:

1. lock the tenant product;
2. prove the owner has enough outstanding reservation;
3. decrement `Product.reserved` and `Product.stock` atomically;
4. append an owner-linked `release` movement;
5. append an `out` movement whose `source=reservation-consume` and whose `sourceId` points to the release movement;
6. persist the idempotency result and audit the operation.

The generic movement reversal endpoint rejects either half of this paired consumption. A later fulfillment workflow must reverse the pair as one business operation rather than corrupting stock/reservation aggregates independently.

## API compatibility

Existing `POST /inventory/movements` remains available. `in` and `out` preserve their existing contract. `reservation` and `release` now require valid `source` + `sourceId`; this is an intentional integrity hardening.

New endpoint:

```http
POST /inventory/reservations/consume
Idempotency-Key: <opaque key>
Content-Type: application/json

{
  "productId": "uuid",
  "quantity": "2.000",
  "source": "sales-order",
  "sourceId": "so-2026-0001",
  "unitCost": "12.50",
  "note": "Delivery fulfillment"
}
```

All quantity arithmetic remains Prisma Decimal at scale 3. JSON numeric compatibility fields remain boundary-only; domain calculations do not use IEEE-754 numbers.

## Deliberate non-goals / next gaps

This slice does **not** introduce warehouse/location allocation, batch/lot reservation, FEFO picking, reorder planning or the Sales Order/Delivery domain itself. Those require separate atomic tickets because they add new ownership/state-machine concerns. The reservation service is intentionally reusable by Sales Orders, Dental materials, Veterinary pharmacy, Care pharmacy and any other vertical without duplicating inventory authority.

## Verification contract

Required automated regressions cover:

- owner normalization;
- outstanding derivation by owner;
- cross-owner over-release rejection;
- successful paired consumption;
- route wiring through the domain service;
- idempotent consume/replay contract;
- generic reversal guard for consumption pairs.

Full backend typecheck/suite and PostgreSQL integration evidence must be reported separately. Provider/runner failures are `BLOCKED_INFRASTRUCTURE` or `NOT_EXECUTED`, never PASS.
