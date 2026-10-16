# POS #765 — Lector de códigos con teclado y continuidad de captura

## Integración visible

El área POS de la pantalla **Ventas** mantiene la búsqueda por SKU/barcode/ProductCode en el endpoint canónico autenticado `GET /sales/pos/product-lookup`, la validación de producto antes del carrito y el bloqueo single-flight previamente fusionados. Ahora incluye manejo de teclado **local a esa sección**:

- **Enter**, con el campo lector enfocado: envío nativo del formulario de búsqueda. No se genera un evento sintético ni se ejecuta dos veces `lookupAndAddPosProduct`. El backend sigue decidiendo coincidencia/código único, tenant y permisos.
- **/**, cuando el foco está en una zona no editable de esa misma sección: enfoca el campo lector. Ignora textarea, input, select, contenteditable, textbox/combobox, diálogo, composición IME, auto-repeat y combinaciones Ctrl/Alt/Meta. No registra escuchas `window/document` ni secuestra atajos del resto del ERP.
- **Escape**, únicamente cuando el foco está en el campo lector: borra el texto sin borrar productos del carrito ni cerrar otros formularios.
- **Enfocar lector**: botón explícito, de 44px, accesible desde ratón y táctil.
- Después de agregar un producto confirmado por backend, el formulario limpia el código y solicita reenfoque **después** de que React deshabilite/habilite la entrada. El efecto verifica que el usuario no haya cambiado de campo ni de tenant. Las rutas de error conservan el código y el carrito para evitar reintentos inseguros.

Los atajos se bloquean mientras las consultas del carrito u otros preflights están ocupados. El manejador solo tiene acceso al contenedor del POS, de modo que no interfiere con módulos externos del monorepo. Nada de esta modificación crea venta, factura, cobro, reserva, asiento fiscal ni movimiento de inventario.

## Pruebas focalizadas

```sh
npm --workspace frontend run test:pos:scanner
node --test tests/pos_scanner_keyboard_v765.test.mjs
tsc --allowJs --checkJs --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext frontend/src/services/posScannerKeyboard.mjs
```

- **18/18 PASS**: casos del archivo nativo de test ejecutados en V8 sobre los blobs exactos de GitHub para la política pura, la pantalla y la suite; no se ha ejecutado `node --test` sobre el checkout de este PR.
- **9/9 PASS**: casos del manejador real `handlePosScannerKeyboard` extraído sin cambios del archivo GitHub y ejecutado en V8 con event target/inputRef simulados: foco, exclusión de otros inputs, Escape en scanner y fuera, Enter nativo, Ctrl/Meta, IME, estado ocupado, diálogo.
- Se detectó y corrigió **antes del PR** una prueba fuente que no toleraba el espaciado JSX y un problema real de UX que intentaba reenfocar el input cuando React aún lo tenía deshabilitado.
- **NO EJECUTADO**: build Vite/JSX real, TypeScript monorepo, Playwright/Chromium con lector físico, Android/PWA, Pg17, permisos HTTP tenant A/B, tests de integración del repositorio y GitHub CI (queued != PASS). No se deshabilitan workflows o protecciones.

## Rollback y tareas residuales

Revertir la integración `SalesPage.jsx`, el módulo `posScannerKeyboard.mjs`, suite de test y script, y esta documentación. No tiene migraciones ni datos a compensar. La validación con scanner real/teclado físico y pantalla de 360/390/430px sigue pendiente de QA.

El issue funcional #765 permanece **OPEN**: este incremento cubre parcialmente scanner/keyboard del POS; continúan pendientes checkout transaccional, caja, pagos mixtos, reservas/consumo de stock, reglas fiscales, ledger y E2E PostgreSQL+browser. `SOURCE_REUSE=NONE`.