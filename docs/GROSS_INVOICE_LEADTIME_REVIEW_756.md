# #756 · Revisión de cobertura según facturación bruta y plazo indicado

## Contrato de producto

`GET /api/v1/reports/inventory/reorder?includeSalesEvidence=true&salesWindowDays=30&leadTimeDays=7`

Se amplía el reporte paginado de reposición existente con un indicador **opcional** para comparar el stock libre actual con las unidades brutas facturadas durante un período histórico y un plazo de reposición **aportado por el operador**.

- `leadTimeDays` sólo es válido si `includeSalesEvidence=true`. Admite enteros de 1 a 365 sin ceros iniciales; de lo contrario responde HTTP 400. Si se omite, la respuesta de `planning.salesEvidence` **se mantiene sin la nueva sección** y no ejecuta cálculos adicionales de cobertura. Si tampoco se pide `includeSalesEvidence`, la ruta de reposición tradicional continúa sin consulta SQL de facturas.
- El nuevo objeto `planning.salesEvidence.leadTimeReview` se limita a candidatos de reposición de la página vigente; los `candidateIds` siguen acotados a 1000 productos. No intenta evaluar todo el catálogo a partir de una página y no genera un cursor estable entre solicitudes.
- Se reutiliza la agregación existente sobre `SalesInvoiceLine` para facturas emitidas/pagadas/vencidas del tenant del contexto autenticado, con lectura bajo `RepeatableRead`. No se ejecutan queries adicionales y no se aceptan claves de tenant arbitrarias. Sigue rigiendo `requireTenant` + `reports.view`.
- La comparación se basa en `available = Product.stock - Product.reserved` según la autoridad actual del producto y en `grossInvoicedUnitsExact` según facturas. Proyección matemática `coverageDays = available * salesWindowDays / grossInvoicedUnits`, redondeada a dos decimales **sólo para visualizar**. El estado de revisión se compara sin redondeo mediante `available*windowDays <= grossInvoicedUnits*leadTimeDays` utilizando BigInt exacto y escala 3; no usa `number` para cantidades.
- Estados: `AT_OR_BELOW_LEADTIME_PROXY`, `ABOVE_LEADTIME_PROXY`, `NO_GROSS_INVOICES_IN_WINDOW`, `NO_FREE_STOCK`. Ninguno indica que deba efectuarse una compra ni que una demanda futura esté demostrada.
- La devolución se marca `interpretation=GROSS_INVOICE_THROUGHPUT_PROXY_NOT_DEMAND_FORECAST`, `netReturnsKnown=false`, `physicalStockOutboundAuthority=false`, `locationAllocationVerified=false`, `demandForecast=false` y `automatedProcurement=false`; cada fila lleva `createsPurchaseOrder=false` y `requiresManualVerification=true`.
- Todos los candidatos deben identificarse de forma única y corresponder uno a uno a los grupos proyectados de ventas; grupos inconsistentes, valores negativos, cantidades no canónicas, stock disponible negativo, overflow de precisión de cantidad o incoherencias de facturación se rechazan. La ruta devuelve 409 de conflicto de evidencia sin transformar estos casos en sugerencias falsas.
- No se modifica `minShortfallExact`, política persistente, pedidos, asientos, existencias, contratos de reservas, lotes, almacenes, FEFO ni outbox. No hay DDL/migraciones.

## Evidencia y riesgos

- Pure helper `backend/src/modules/reports/gross-invoice-leadtime-review.ts`, SHA Git blob EXACTO `f042dcca8f338d550bd568183e45d06db1711169`: compilado aislado con `tsc --noEmit --target es2022 --module nodenext --moduleResolution nodenext --skipLibCheck` (TS 5.8.3): **PASS**.
- `tests/gross_invoice_leadtime_review_v756.test.mjs`, blob EXACTO `c308489f9039ca23ae0beb01b02e4c9d95f87a11`: 12/12 Node.js 22.16 TAP pruebas **PASS** ejecutadas en archivos cuyos hashes son idénticos a los de la rama. Las pruebas comprueban límites, comparación exacta frente al redondeo visual, compatibilidad opcional, integridad de IDs, validación de disponibilidad, overflow, ausencia de compras.
- `backend/package.json` añade esta suite a `test:reports`, pero la ejecución de toda la suite del monorepo no está disponible aquí. Revisión estática del router separada de QA HTTP.
- `npm ci`, compilación global, PostgreSQL17 tenants A/B, permisos HTTP 400/401/403/404, E2E/Playwright, rendimiento real y CI remoto exact-SHA: **NOT_EXECUTED** en este entorno sin checkout y dependencias del backend; jobs queued/skipped nunca son PASS.

## Restante del issue #756

El requisito original exige políticas persistentes por producto y ubicación, safety stock/lead time autorizados, asignación física por lote/FEFO #755, previsión sobre demanda verdaderamente conciliada, notas de crédito/retornos netos, alertas en outbox y QA PostgreSQL/HTTP. Este avance es una **comparación manual opcional**, no cierre del DoD. Mantener #756 abierto.

Rollback: revertir el PR de cinco archivos. No cambia datos, esquema ni registros fiscales. SOURCE_REUSE=NONE.
