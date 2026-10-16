# #770 — CSV de productos: vista previa segura sin importación

Nuevo parser estricto `product-csv-import-preview.mjs` para `sku,name,description` de producto. Límite 256 KiB, 1000 filas; CSV con comillas, escape doble, CRLF/BOM, cabeceras allowlisted, códigos duplicados en el archivo, fórmula CSV y caracteres de control. Entrega filas válidas/errores con números de fila sin guardar nada. **No acepta `tenantId`, precio, saldo de stock ni atributos protegidos de cliente** en columnas, y exige tenant resuelto por backend.

`committable:false`, `requiresTenantCatalogDedupe:true`, `persisted:false`: el resultado no da permiso para mutar `Product`, ni hace dedupe con la base existente. La importación real requiere validación en transacción PG17, tenant/RBAC, versionado e idempotencia, auditoría, dry-run con aceptación explícita y estrategia rollback. La exportación CSV/JSON existente del PR #1014 no se altera.

Pruebas: `node --test tests/product_csv_import_preview_v770.test.mjs`. No se implementó Excel/XLSX, parser streaming, API de importación, dedupe DB ni interfaz. #770 permanece OPEN. Rollback: tres archivos nuevos, sin migraciones. SOURCE_REUSE=NONE.
