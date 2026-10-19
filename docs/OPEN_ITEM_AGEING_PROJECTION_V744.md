# #744 — proyección informativa de antigüedad AR/AP (incremento)

El módulo puro `backend/src/modules/finance/open-item-ageing-projection.mjs` proyecta las facturas abiertas por fecha de corte UTC, calcula `bruto - allocations verificadas` en centésimos BigInt y agrupa por moneda sin convertir divisas. Protege contra over-allocation, fechas imposibles, documentos duplicados y scope tenant/cliente-proveedor. Los límites 30/31, 60/61 y 90/91 días son deterministas.

**No** infiere pagos del estado `paid/overdue`, ni crea una autoridad de pagos paralela. Exige `allocationSourceVerified:true` como precondición de un futuro servicio de dominio que suministre allocations reales comprobadas; ningún cliente puede poner ese flag para autorizar dinero. No consulta DB, escribe ledger, genera reminders o calcula FX. Es una proyección **read-only**, todavía NO se expone como saldo AR/AP oficial ni statement.

Pruebas: `node --test tests/open_item_ageing_projection_v744.test.mjs`. Pendiente: caracterización y persistencia de allocations reales, credit notes, statement/dunning, fiscal period lock, 2 tenants, PG17, reconciliación GL, browser. #744 sigue OPEN. Rollback: revert 3 files sin SQL.
