# POS #765 — Verificación de identidad del carrito completo contra el servidor

## Alcance implementado

En la pantalla real **Ventas**, el operador puede pulsar **Comprobar identidad de productos** cuando tiene un carrito de borrador con cantidades ya aplicadas. La verificación consulta, **para cada línea**, la ruta existente `GET /sales/pos/product-lookup?code=<SKU>` con la sesión/tenant y permisos del backend. Cada respuesta debe resolver el **mismo UUID y SKU exacto** que fueron confirmados cuando se añadió el producto; nunca se acepta automáticamente un SKU reasignado, un producto eliminado/inactivo, una colisión, una línea duplicada o un dato malformado.

La nueva política pura `frontend/src/services/posDraftVerification.mjs` reconstruye cantidades Decimal(18,3) mediante `posCartPolicy`, valida SKU de todas las líneas y compara las identidades normalizadas por `acceptServerPosProduct`. Devuelve solo `verified`, `invalid`, `changed`, `unavailable` o `stale`; no concede autorización para venta, checkout, IVA, cobro, stock, tipo de cambio o asiento contable.

Las consultas son secuenciales, máximo 100 productos en el borrador y **sin escrituras**. Un contador de revisión monotónico y la identidad del carrito activo bloquean la aceptación de cualquier resultado obsoleto si se modifica una cantidad, entra otro producto, se retira una línea, se pone el carrito en espera, se recupera otro o cambia la empresa. Un guard single-flight evita verificación simultánea y bloquea las mutaciones de carrito durante la consulta. Al completar, la UI muestra siempre la limitación: **No confirma precio, existencias, impuestos ni disponibilidad para cobrar**.

## Pruebas y QA

```sh
npm --workspace frontend run test:pos:verify
node --test tests/pos_draft_verification_v765.test.mjs
tsc --allowJs --checkJs --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext frontend/src/services/posDraftVerification.mjs
```

Pruebas efectivamente evaluadas directamente contra el código de los blobs de GitHub: **18/18 casos** de la suite de verificación ejecutados en V8 con implementaciones auxiliares obtenidas del mismo repositorio (mismo UUID, SKU reasignado, SKU modificado, error en la segunda línea, cantidades/labels malformados, duplicados, revisión/tenant cambiados, guardas de fuente JSX). Además **8/8 escenarios** del manejador real `verifyCurrentPosDraft` extraído del archivo de GitHub y **8/8 invariantes UI**.

El archivo `tests/pos_draft_verification_v765.test.mjs` contiene los tests Node nativos y el script permite su ejecución en el checkout. La suite se evaluó en V8 con su mismo contenido/casos, **no** a través de `node --test` del monorepo. TypeScript estricto, Vite full build, navegador Chromium, PG17 tenant A/B, test HTTP real, suite completa y remote CI **NOT_EXECUTED** en este contexto; nunca atribuirles PASS. Los checks remotos no se desactivaron.

## Riesgos, rollback y siguientes pasos

La verificación de identidad es una fotografía del momento de la consulta. Por diseño **NO** prueba stock, precio, descuento, fiscalidad, pago, idempotencia de checkout ni invariantes bancarias. Las comprobaciones decisivas deberán repetirse dentro de una transacción server-side al cobrar. Mantener #765 **OPEN** hasta completar caja/turnos, pagos mixtos, stock y lotes, fiscal, devoluciones, ledger/banking y QA PG17 + navegador.

Rollback: revertir el módulo de verificación, el botón y estado de Ventas, suite/script y esta documentación. No hay migración, cambios de datos ni side effects financieros. `SOURCE_REUSE=NONE`.
