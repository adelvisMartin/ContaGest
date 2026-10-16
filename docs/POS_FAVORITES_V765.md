# ContaGest #765 — Favoritos rápidos en Ventas (POS)

## Alcance y flujo integrado

La ruta existente `Ventas` dispone ahora de accesos de producto favoritos, para abreviar la preparación de carritos:
1. Un operador autenticado agrega un producto usando el endpoint existente `GET /sales/pos/product-lookup?code=...`.
2. En el carrito puede marcar el producto como **Favorito**. La pantalla conserva solo `id`, `sku` y `name`, sin precio, stock, impuesto, tenant ni datos financieros. Hasta **12 referencias** sin duplicados.
3. Al pulsar un favorito, el frontend **siempre vuelve a consultar el endpoint autorizado**, verifica que la respuesta siga perteneciendo al mismo UUID y SKU y solo entonces usa la política exacta `posCartPolicy` para agregar la unidad al borrador.
4. Un código reasignado, producto inactivo o ausente, alias/SKU modificado, colisión, respuesta malformada, fallo de red o cambio de empresa **no** añade la línea. Un favorito que fue retirado tampoco puede reutilizarse desde un callback antiguo.
5. Favores, carritos y estados en espera son temporales **en la memoria del componente**; se limpian al abandonar Ventas, recargar o cambiar de empresa. No se emplea localStorage, IndexedDB ni persistencia servidor.

No existe checkout ni autoridad de inventario, fiscal, efectivo, pagos, ledger o ticket persistido por este flujo. Toda validación decisiva sigue estando en el backend existente.

## Archivos

- `frontend/src/services/posFavoritePolicy.mjs`: favorito inmutable de identidad y etiqueta, validación de UUID/SKU, límite 12, comprobación de coincidencia servidor.
- `frontend/src/pages/SalesPage.jsx`: botones de marcar/quitar favorito en línea y atajos con consulta nueva al backend.
- `tests/pos_favorites_v765.test.mjs`: regresiones de identidad, mutación, duplicados, límites, condiciones hostiles y verificación remota.
- `frontend/package.json`: comando independiente `test:pos:favorites`.

## QA e integridad

```sh
npm --workspace frontend run test:pos:favorites
# alternativa sin instalaciones:
node --test tests/pos_favorites_v765.test.mjs
tsc --allowJs --checkJs --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext frontend/src/services/posFavoritePolicy.mjs
```

**Ejecutado (Node 22.16):** 17/17 pruebas nativas del nuevo módulo, `node --check`, TypeScript estricto; el hash `git hash-object` del módulo `12a2979a9fc29156933997754afee47a8ef1899f` y de la suite `59891240dbedf5823ddbd3df3e4b88821228f309` coinciden con los blobs publicados en GitHub. El módulo dependiente de normalización se reprodujo con su misma función de validación y regex; no se ejecutó una instalación monorepo.

**Ejecutado (V8):** 6/6 escenarios de los manejadores reales extraídos de `SalesPage.jsx` remoto exacto: producto confirmado, ID reasignado, SKU cambiado, servidor 404, tenant cambiado durante consulta y favorito retirado antes del clic. 8/8 invariantes de enlace de UI, seguridad y ausencia de escrituras financieras. No equivale a ejecución del navegador.

**NOT_EXECUTED:** npm ci, build JSX/Vite, Chromium/Playwright móvil/escritorio, PostgreSQL17 con tenant A/B, E2E checkout y suite del repositorio. Los jobs CI remotos en cola no se presentan como PASS.

## Pendientes, riesgos y reversión

Los favoritos no son marcadores persistentes por usuario o caja; se pierden al desmontar el componente. Para favoritos persistentes se requiere una implementación independiente con tenant/cajero, permisos y QA. El issue #765 continúa pendiente del POS transaccional (caja, turnos, pagos, promociones auditables, stock, fiscal, ledger, devoluciones y conciliación). Rollback: revertir los cuatro archivos de código, pruebas y script más esta documentación. No hay migraciones ni escrituras financieras. `SOURCE_REUSE=NONE`.
