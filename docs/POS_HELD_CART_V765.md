# ContaGest #765 — Carritos POS en espera (sesión en memoria)

## Entrega integrada

La pantalla real `Ventas` ahora permite poner el carrito actual en espera, recuperar un carrito anterior **solo cuando el activo esté vacío**, y descartar carritos en espera después de confirmación explícita. Capacidad: **hasta cinco** carritos. Cada ticket tiene UUID aleatorio del navegador; contiene únicamente lista de `productId` y `quantity` Decimal(18,3), más SKU y nombre para mostrarlo. No incluye precio, total, cliente, pagos ni datos fiscales.

Los carritos en espera viven solamente en el estado del componente React y sus `useRef`: **se pierden al salir de Ventas, recargar, cerrar la pestaña o cambiar la empresa activa**. No usa `localStorage`, `sessionStorage`, IndexedDB, API, PostgreSQL, inventario, bancos, ledger ni un checkout. Es un incremento de UX para preparar varias órdenes, **no el hold/resume persistente transaccional** solicitado por el DoD completo.

## Reglas de seguridad operativa

- El módulo `posHeldCartPolicy.mjs` reutiliza `addPosCartItem` para validar estrictamente UUID de producto y cantidades exactas sin floats. Rechaza datos corruptos, líneas duplicadas, nombres incompletos, carros vacíos, carritos repetidos y exceso del límite.
- Todos los snapshots y líneas quedan congelados (inmutables). Recuperar nunca sustituye un carrito activo no vacío ni mezcla silenciosamente las listas.
- Las operaciones se bloquean durante la búsqueda de código o cuando `BackendApi.tenantId` ya cambió; `useEffect` borra activo y en espera al cambiar la empresa y el render oculta inmediatamente los datos de la empresa anterior.
- El botón de descartar pide confirmación; el de guardar advierte si existen cambios de cantidad escritos pero no aplicados, para que no se pierdan en la captura.
- Un UUID del navegador es solo identificador de borrador; **no** constituye idempotency key financiera ni autoridad de pago.

## Contratos y pruebas

```sh
npm --workspace frontend run test:pos:hold
npm --workspace frontend run test:pos:sales
# Control del módulo nuevo:
node --test tests/pos_held_cart_v765.test.mjs
tsc --allowJs --checkJs --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext frontend/src/services/posHeldCartPolicy.mjs
```

- Node 22.16 **17/17 PASS** de los tests nuevos sobre bytes comparados mediante `git hash-object` con el blob remoto: policy `e31137842b88fa9f9894555351be0d13582b1f11`, suite `126f1f61c53a2f61ed173a9f5e4024f49d4364ec`; dependencia `posCartPolicy.mjs` idéntica a `30a5fc7ecd9aed79b1d28cb8b0a46035b331235e`. Validación aislada TypeScript `--checkJs --strict` y `node --check`: PASS.
- **9/9** comprobaciones de handlers reales `holdCurrentPosDraft`, `resumeHeldPosDraft`, `discardHeldPosDraft` ejecutadas en V8, extrayendo funciones de `SalesPage.jsx` publicada en GitHub, con estados y APIs simulados; no equivale a test de navegador real.
- `tests/pos_sales_draft_cart_v765.test.mjs` corrige un contrato fuente obsoleto: el frontend usa ahora el endpoint de lookup por tenant de PR #1068/#1115, ya no `BackendApi.list('products')`. Se conservan los demás 12 tests originales.
- **NOT_EXECUTED**: compilación JSX/Vite de toda la aplicación, suite completa de repositorio, Cypress/Playwright navegador, PG17/tenant A/B, QA responsive/light/dark. CI en cola no cuenta como PASS; no se modifican workflows ni checks de protección.

## Rollback y siguientes tareas

Revertir la integración de UI, módulo de holds, script, test y este documento; no requiere migraciones ni compensación de transacciones. Siguiente fase del #765: holds persistentes tenant/cajero aislados y expiración controlada, checkout respaldado por servidor, caja/turno, pagos mixtos, inventario, fiscal, banca, ledger y pruebas con PostgreSQL17 y navegador. **El issue padre no debe marcarse DONE por este PR.** `SOURCE_REUSE=NONE`.
