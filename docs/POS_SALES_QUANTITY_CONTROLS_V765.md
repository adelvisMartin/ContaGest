# POS #765 — Control de cantidad en el borrador de Ventas

## Alcance implementado

La sección de carrito temporal ya existente en `frontend/src/pages/SalesPage.jsx` permite ahora operar cada línea con controles táctiles de al menos 44 píxeles:
- **+1** agrega una unidad reutilizando `addPosCartItem`.
- **−1** resta exactamente una unidad reutilizando la extensión `decrementPosCartItem` del servicio del carrito: si la cantidad previa es 1.000 o menor, retira explícitamente la línea; de 1.001 resta 1.000 y conserva 0.001.
- **Cantidad + Aplicar** permite escribir una cadena exacta de hasta tres decimales, validada exclusivamente mediante `setPosCartQuantity`. Cero, negativos, notación exponencial, floats no textuales, exceso de precisión y desbordamientos son rechazados sin modificar el borrador.
- **Quitar** elimina expresamente la línea con la función ya existente.
- Errores visibles conservan el valor introducido para corrección; un incremento válido vuelve a sincronizar el campo con la cantidad canónica.
- El borrador y las entradas de edición se reinician al cambiar tenant; las operaciones de línea verifican que la empresa activa no haya cambiado.
- No se guardan precios, impuestos, IVA, stock ni cobros. No se emiten facturas ni se modifica la base de datos.

## Verificaciones focalizadas

```sh
npm --workspace frontend run test:pos:quantity
node --test tests/pos_sales_quantity_controls_v765.test.mjs
node --test tests/pos_cart_policy_v765.test.mjs
tsc --allowJs --checkJs --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext frontend/src/services/posCartPolicy.mjs
```

Se ejecutaron 12/12 casos nuevos de operaciones Decimal(18,3) y 21/21 regresiones antiguas del carrito, más `node --check` y TypeScript estricto, todos PASS en el espejo local con el hash Git exacto. Se ejecutaron asimismo 7/7 escenarios de los manejadores reales (`stepPosDraftQuantity`, `applyPosDraftQuantity`, `removePosDraftProduct`) con la versión exacta de GitHub `SalesPage.jsx` en V8, además de 8/8 guardas estáticas de integración. El espejo no incluye React ni Chromium.

**No ejecutado:** npm ci completo, build Vite/React, pruebas browser responsive/teclado, Postgres 17, API tenant A/B y suite monorepo completa. Los checks remotos en cola no se consideran PASS. Ninguna de estas pruebas valida un checkout funcional.

## Límites de responsabilidad

El carrito sigue siendo solo una preparación local; autenticación de producto y tenant depende del backend y del futuro lookup autoritativo del PR #1068. La cantidad local debe validarse de nuevo servidor-side al confirmar una venta. El POS #765 **continúa abierto** hasta caja/turnos, pagos, reserva y consumo de stock, fiscal, ledger y conciliación E2E.

Rollback: revertir el cambio a `SalesPage.jsx`, el incremento de `posCartPolicy.mjs`, la suite, el script frontend y esta documentación. No requiere migraciones ni compensaciones.
