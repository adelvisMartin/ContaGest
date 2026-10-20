# #753 · Preparación segura de transiciones presupuesto→pedido

`prepareQuoteOrderTransition` define una política determinista **sin efecto en base de datos** para transiciones de presupuestos (draft→sent→accepted/rejected/expired/cancelled) y de pedidos (draft→confirmed→partially_fulfilled→fulfilled/cancelled). Requiere scope de empresa, ID de documento y revisión esperada para un futuro compare-and-swap tenant-scoped. No convierte un presupuesto en pedido ni consume reservas por sí mismo.

No existe autorización a crear facturas, ledger ni reservas: la salida contiene `persisted:false`, `invoiceAuthorized:false`, `reservationAuthorized:false`, `ledgerAuthorized:false`. Se ejecutó `node --experimental-strip-types --test tests/sales_quote_order_transition_v753.test.mjs` con Node22: 7 casos aprobados, TypeScript estricto aislado PASS. El código deberá conectarse posteriormente a SalesQuote/SalesOrder durables y #738 con audit y idempotencia real. Full PostgreSQL17, tenant A/B, rutas HTTP y workflows no ejecutados aquí.

**Ticket #753 permanece OPEN/PARTIAL.** Se requiere migración, APIs, numeración tenant-safe, taxes y pricing snapshots, reservas, tests de concurrencia y QA. Rollback: revertir módulo, pruebas y documento, sin datos. `SOURCE_REUSE=NONE`.


## Endurecimiento de lookup de transiciones (#753)

La tabla de estados anterior consultaba `domain[from]?.[action]` y admitía accidentalmente claves heredadas de `Object.prototype` en llamadas dinámicas JavaScript, como `__proto__`, `toString` o `constructor`. La nueva política exige `Object.hasOwn` tanto para el estado como para la acción, y comprueba que el destino sea un string del mapa declarado. No se agregan estados ni se crean pedidos, reservas, facturas o efectos financieros. Los tests negativos confirman el rechazo de métodos heredados; TypeScript a nivel de compilación no sustituye esa guarda runtime. Rollback: revertir cambio de lookup y sus pruebas si fuera estrictamente necesario; NO reabrir estados heredados.
