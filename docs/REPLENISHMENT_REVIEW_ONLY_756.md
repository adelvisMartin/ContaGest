# #756 – Planificación de reposición, incremento REVIEW_ONLY

Rama base: main cca06688e8ea1cc2df234f5552085ba0c67eb262 (2026-10-15). Este incremento no sustituye la política de almacén/localizaciones #755 y no introduce una segunda autoridad de stock.

## Comportamiento real

Se reutiliza la ruta existente GET /api/v1/reports/inventory/reorder con permiso reports.view y tenant servidor. La fuente es Product.stock, Product.reserved y Product.minStock por tenant, procesada por buildInventoryStockHealth. La nueva proyección planning.reorderCandidates incluye prioridad, disponibilidad después de reservas, umbral, faltante exacto, motivo de revisión, y manualApprovalRequired=true / autoPurchaseEnabled=false.

El faltante es el mínimo matemático por debajo del punto actual, NO una orden de compra, cantidad económica óptima ni stock de seguridad validado. Para estado at_minimum el faltante es cero y la acción es REVIEW_REORDER_POINT, nunca comprar cero unidades. Se conserva el endpoint anterior y sus rows/summary.

La API declara scope=SCANNED_PAGE_ONLY. El informe escanea como máximo el límite de productos activos de la petición y puede estar truncado: NO afirmar que los candidatos listados representan todo el tenant si meta.truncated es true. No se realizan cambios a balances, reservas, lote, existencia por almacén, secuencia documental ni ledger.

Los Decimal exactos y la política de disponibilidades vienen de la implementación canónica existente. La proyección nueva sólo interpreta filas ya verificadas por el servicio de stock health, sin usar floats y sin dobles agregados persistentes.

## Tests y bloqueo de QA

- Ocho pruebas de funciones y contrato de ruta en tests/replenishment_candidates_v756.test.mjs, agregadas al test:reports del backend.
- Para verificar en checkout con deps: npm ci; npm --workspace backend run test:reports; npm run typecheck; npm run build.
- PostgreSQL17 efímero A/B: exigir tenant isolation, pruebas de stock-reserved y cambios concurrentes, negativo 403, paginación y meta.truncated.
- GitHub Actions quota/cola no es PASS; no desactivar gates ni inventar verde.

## Lo que falta para cerrar issue #756

Aún no existe aquí una política persistente por product/location con reorderPoint/reorderQty/min/max/safetyStock/leadTime; tampoco antigüedad de inventario desde receipts/reversos, reconciliación con movimientos/lotes, buckets con reloj determinista, slow/non-moving/near-expiry, soporte de múltiples almacenes #755, ni alertas/outbox. Se requieren pruebas de base de datos y flujos reales. Por eso este PR es un incremento de orientación operacional y el ticket padre sigue OPEN.

Rollback: revertir proyección, campo planning, tests y hook al runner; ningún cambio de DDL, finanzas o movimiento de inventario.
