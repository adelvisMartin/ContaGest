# POS #765 — Preview de pagos mixtos y vuelto (PARCIAL)

## Alcance real

El módulo backend/src/modules/pos/tender-preview.ts calcula **solo una propuesta de importe restante/vuelto**, nunca confirma un pago, genera asientos, cambia inventario, autoriza tasas FX ni emite un comprobante fiscal.

SOURCE_REUSE=NONE. Compatible con el formato de moneda (tres letras) de backend/src/shared/financial/fx.ts y la escala Decimal(18,2) de backend/src/shared/financial/decimal.ts. Utiliza unidades mínimas bigint en un cálculo aislado para impedir errores de redondeo IEEE-754. No es un segundo motor contable.

## Contrato

- previewPosTender recibe currency, due y tenders. Importes estrictos como **cadenas** de máximo dos decimales, nunca floats ni notación científica; todos acotados a Decimal(18,2).
- Una sola moneda por propuesta. Mezclas VES/USD u otras requieren un servicio de FX autorizado; este módulo las rechaza.
- Métodos permitidos: cash, card, transfer. Máximo doce medios. La propuesta vacía significa pending.
- No permite que tarjeta/transferencia superen conjuntamente el importe de la factura. Solo un importe de efectivo puede producir vuelto.
- Resultados: currency, due, paid, remaining, change, status, cashTendered, nonCashTendered. Importes serializados con dos decimales, sin escrituras.
- Error explícito ante moneda distinta, forma inválida, importe cero o desbordamiento.

## Pruebas locales independientes

~~~sh
node --experimental-strip-types --check backend/src/modules/pos/tender-preview.ts
node --experimental-strip-types --test tests/pos_tender_preview_v765.test.mjs
tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext backend/src/modules/pos/tender-preview.ts
~~~

23 casos Node22: mixtos, parciales, vuelto, centavos, Decimal(18,2), formatos inválidos, sobrepagos y multi-moneda. No equivalen a pruebas DB, HTTP ni E2E del ticket #765.

## Integración pendiente

El total de venta debe venir del backend fiscal/contable canónico, no de cálculos confiados al cliente. La captura/confirmación de pagos, idempotencia, caja, banco, ledger, AR/AP, derechos del usuario, FX oficial y reconciliación se gestionan exclusivamente en sus servicios propietarios, con PostgreSQL17/HTTP/E2E. El endpoint de búsqueda por código del PR #1068 mantiene su propio trabajo y gates.

Este incremento no toca API, UI, rutas ni SQL. El issue #765 permanece ABIERTO hasta los criterios E2E. Rollback: revertir los archivos nuevos sin migración.

## Integridad del preview calculado (#765)

El contrato `Readonly<PosTenderPreview>` de TypeScript no impide que código JavaScript modifique `paid`, `change` o `status` después del cálculo. El resultado se devuelve ahora mediante `Object.freeze` y conserva **exactamente los mismos campos** y operaciones BigInt en céntimos. Dos regresiones nuevas validan que no sea posible convertir en memoria un resultado parcial o con vuelto en una supuesta confirmación y que ninguna salida conceda `paymentCaptured`, `checkoutAuthorized` ni `receiptId`.

Esto no inmoviliza los datos originales del cliente ni constituye captura de pago. La autoridad de caja, ventas, ledger y conciliación continúa siendo transaccional y server-side. Rollback puntual: revertir la congelación del objeto de salida y las dos regresiones, sin migraciones.
