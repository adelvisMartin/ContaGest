# #782 — Evidencia de cobertura de libros, sin certificación fiscal

Se reutilizan las **facturas reales** `SalesInvoice` y `PurchaseInvoice` de PostgreSQL, con `tenantId` resuelto en servidor y permiso `fiscal.read`. La ruta `GET /fiscal/books/readiness?book=sales|purchases&period=AAAA-MM` consulta únicamente los documentos del período indicado; devuelve identificadores, fechas, estado, motivos de bloqueo y un SHA-256 estable sobre la evidencia ordenada (no sobre cifras de impuestos).

**Motivo estructural del bloqueo:** en el esquema actual no existe enlace FK verificable de factura comercial a `FiscalDocumentRuleSnapshot` aprobado. Se prohíbe fabricar líneas, clasificar gravados por la tasa default existente en `SalesInvoiceLine`, reinterpretar históricos, inferir alícuotas o marcar libro como conforme sin fuente. Por ello la respuesta siempre es `BLOCKED_NOT_CERTIFIED` e informa también si el período está vacío, hay facturas borrador, canceladas o fecha que requiere revisión.

Límite 500 fuentes, sin truncación silenciosa. No introduce escritura, secuencia fiscal, cierre, export, ni un segundo libro persistido. El siguiente incremento debe vincular documentos por FK verificable, importar snapshots ya aplicados, reconciliar ledger, asegurar eventos de reverso/cierre y producir libros reproducibles y auditables.

**NO_MERGE/NO_DOD**: no se ejecutó PostgreSQL17 from-zero/upgrade ni API E2E/RBAC dos tenants, ni QA de cierre. La parte read-only no se declara libro de compras o ventas habilitado.
