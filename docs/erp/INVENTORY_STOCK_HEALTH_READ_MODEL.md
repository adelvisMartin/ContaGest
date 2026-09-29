# Inventory Stock Health Read Model

**Issue:** #763  
**Parents:** #708 / #756 / #624  
**Baseline:** `main@66a4130b6472eea824f675ef2b4a1e9b66e34718`  
**SOURCE_REUSE=NONE**

## Purpose

ContaGest already owns the inventory source of truth: `Product.stock`, `Product.reserved`, immutable `InventoryMovement` rows and the owner-scoped reservation lifecycle introduced by #738. This read model does not create another balance. It turns those existing aggregates into an operational, tenant-scoped signal for products that are out of stock or at/below the configured `minStock` threshold.

The previous `/reports/inventory` response is still a legacy placeholder. This slice adds a real endpoint without pretending that the broader valuation/ageing report is finished.

## OSS benchmark

The functional behavior was compared with ERPNext stock-level/projected-quantity/reorder concepts and Tryton replenishment concepts. Their code is not reused. ContaGest deliberately implements only what its current domain can prove today: stock, reserved stock, available stock, minimum stock and shortfall. Lead time, safety stock, warehouse allocation and purchase suggestions remain separate follow-ups.

`SOURCE_REUSE=NONE`

## Domain formula

All quantities remain Prisma Decimal / `Decimal(18,3)`:

```text
available = stock - reserved
shortfall = max(minStock - available, 0)
```

Statuses:

- `out_of_stock`: `available <= 0`;
- `below_minimum`: `0 < available < minStock`;
- `at_minimum`: configured `minStock > 0` and `available == minStock`;
- `healthy`: every other case.

`needsReorder` is true only when a positive minimum is configured and `available <= minStock`. A product with `minStock=0` does not generate reorder noise solely because its stock is zero.

## API

```http
GET /reports/inventory/reorder?onlyNeedsReorder=true&take=500
Authorization: Bearer ...
```

The reports router requires tenant context and `reports.view`. Queries always constrain products by `tenantId` and `active=true`.

Example response shape:

```json
{
  "report": "inventory-reorder",
  "rows": [
    {
      "productId": "...",
      "sku": "SKU-1",
      "name": "Producto 1",
      "stockExact": "10.000",
      "reservedExact": "7.500",
      "availableExact": "2.500",
      "minStockExact": "4.000",
      "shortfallExact": "1.500",
      "status": "below_minimum",
      "needsReorder": true
    }
  ],
  "summary": {
    "totalProducts": 1,
    "needsReorder": 1,
    "counts": {
      "out_of_stock": 0,
      "below_minimum": 1,
      "at_minimum": 0,
      "healthy": 0
    },
    "totalShortfallExact": "1.500"
  },
  "meta": {
    "onlyNeedsReorder": true,
    "activeProducts": 1,
    "scannedProducts": 1,
    "scanLimit": 500,
    "truncated": false
  }
}
```

The scan is intentionally bounded to `1..1000`. `meta.truncated=true` explicitly prevents a partial scan from being misrepresented as a complete tenant report.

## Non-goals

This endpoint does not:

- create Purchase Orders;
- infer lead times or safety stock not stored by ContaGest;
- allocate warehouse/bin stock;
- choose lots/batches/FEFO;
- replace the inventory ledger;
- perform stock valuation or stock ageing.

Those belong to #755, #756 and #757.

## Verification contract

Preventive tests cover reserved-vs-available arithmetic, exact minimum boundaries, zero-minimum behavior, healthy state, tenant/RBAC route wiring, actionable-only filtering and bounded scans. Full backend typecheck/runtime evidence is accepted only when the exact candidate actually executes it; runner/quota failures remain `BLOCKED_INFRASTRUCTURE` or `NOT_EXECUTED`.
