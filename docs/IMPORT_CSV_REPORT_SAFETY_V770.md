# #770 · Entrada CSV de productos y protección de reportes

Un lote de importación debe pasar por `POST /imports/preview` y `POST /imports/:id/commit` con checksum/idempotencia y permisos server-owned; el parser `product-csv-import-preview.mjs` previamente fusionado era sólo una función de biblioteca, no una ruta.

**Nuevo** `POST /imports/products/csv/preview`, bajo `requireTenant + admin.manage`, acepta exclusivamente `{csv:string}` (máximo 262144 caracteres; el parser aplica además el límite exacto de 256 KiB). Aplica validación estricta de encabezados y contenido, excluye stock/price/tax/tenant de la entrada, devuelve errores por fila y **siempre** `persisted=false, committable=false, readyForCommit=false, catalogDuplicatesVerified=false`. No escribe ImportBatch, inventario ni ledger. El usuario debe revisar y convertir voluntariamente a la autoridad existente /imports/preview, con validación DB del tenant.

El CSV de reportes de batches en `GET /imports/:id/report` pasaba fórmulas que comenzaban con espacios, tabs o controles. `encodeImportReportCsvCell` elimina controles que permiten saltos de registro, antepone apóstrofo para fórmulas incluso con espacios Unicode, y conserva escape de comillas dobles. Incluye tests para `=,+,-,@`, invisibles, nuevas líneas, comillas y adapter.

**Pendientes:** upload multipart XLSX/JSON, mapeo de columnas confiable, deduplicación product-SKU en la base (incluido casefold), importación con aprobación, compatibilidad API/Chromium y QA PostgreSQL 17 tenants A/B. Nunca ofrecer commit directo del CSV previsualizado. Este PR es PARCIAL para #770; no es importación completa y no debe fusionarse antes de ejecutar sus gates de integración. SOURCE_REUSE=NONE.
