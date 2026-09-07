# Cuentas por pagar — ingestión documental v235

## Objetivo

Reducir la captura manual de facturas de proveedor sin convertir OCR/parsing en una autoridad contable o fiscal. El flujo termina primero en **revisión humana** y, después de confirmación explícita, crea únicamente una `PurchaseInvoice` en estado `draft`.

## Pipeline y estados

```text
documento recibido
  -> validación de tamaño, tipo real y contenido activo
  -> hash SHA-256 / deduplicación exacta por tenant
  -> uploaded
  -> parsing
  -> extracción versionada + confidence por campo
  -> matching proveedor / PO / recepción
  -> review
     -> rejected      (evidencia conservada)
     -> confirmed
        -> draft_created (PurchaseInvoice.status = draft)
  -> error            (original conservado, reprocesable)
```

Estados persistidos en `PayableDocument.state`: `uploaded`, `parsing`, `review`, `draft_created` y `error`. El estado de decisión humana se conserva por separado en `reviewStatus`: `pending`, `confirmed` o `rejected`.

## Invariantes

- El documento original se conserva como bytes privados e inmutables en `PayableDocument.originalContent`; el código de aplicación no actualiza esa columna tras la ingestión.
- El primer resultado de parser se conserva en `parserResult`. Cada reproceso crea un `PayableParserRun` nuevo con `parserName`, `parserVersion`, duración, resultado o error. Un parser nuevo no reescribe una ejecución histórica.
- La corrección humana vive en `reviewedData`; no modifica el resultado original del parser.
- Ningún camino de este módulo contabiliza asientos ni cambia una compra a `issued`/`paid`. El único documento contable creado desde OCR es `PurchaseInvoice.status = draft`.
- Un archivo con el mismo SHA-256 dentro del mismo tenant devuelve el documento existente. Una factura con el mismo proveedor + referencia y otro hash se marca como `suspectedDuplicate` y queda bloqueada para crear una segunda obligación hasta resolverla.
- Un proveedor desconocido puede ser sugerido por RIF, pero nunca se crea automáticamente.
- Todas las lecturas, escrituras, dedupe y matching incluyen `tenantId`. Las tablas nuevas tienen RLS forzada con `private.current_tenant_id()`.
- Los importes revisados usan `Prisma.Decimal`; no se usan operaciones binarias de punto flotante para crear el borrador.

## Upload y threat model

Se aceptan `application/pdf`, `image/jpeg`, `image/png` e `image/webp`, máximo 8 MiB. El backend verifica magic bytes en vez de confiar en el `Content-Type` declarado. Se bloquean archivos vacíos, MIME spoofing, PDFs de más de 100 páginas y marcadores de contenido activo/peligroso (`/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`) además de la cadena EICAR de prueba.

La ruta de upload está bajo los controles existentes de ContaGest: sesión, CSRF para mutaciones, aceptación legal, suscripción comercial, contexto de tenant, rate limiting y `purchases.manage`. El documento original se entrega sólo mediante un endpoint autenticado con `Cache-Control: private, no-store` y `X-Content-Type-Options: nosniff`; no se publica una URL abierta.

Un antivirus dedicado o CDR puede agregarse después como adapter, pero la validación actual es deliberadamente fail-closed para los marcadores soportados. No se afirma que la inspección de bytes sustituya un antivirus corporativo.

## OCR/parser

`PayableDocumentParser` es el contrato reemplazable. `SafeLocalParser` es el provider inicial y no envía datos a terceros. Extrae conservadoramente texto visible de documentos PDF digitales y genera `confidence` por campo para proveedor/RIF, factura, fecha, moneda, subtotal, impuesto, total y referencias PO/recepción.

Para JPG/PNG/WebP el adapter local **no finge OCR visual**: el archivo es válido y entra al flujo, pero sus campos quedan en baja confianza y requieren revisión/corrección humana. Un provider OCR externo futuro debe implementar el mismo contrato y no puede habilitarse en producción sin revisión contractual, privacidad/data-processing y consentimiento aplicables.

Las trazas y auditorías sólo registran IDs, hash, MIME, tamaño, estado, versión y códigos de error sanitizados; no se vuelca el contenido binario ni el texto completo extraído en logs.

## Matching 2-way / 3-way

El matching usa registros tenant-scoped de órdenes de compra y recepciones cuando existen:

- `2-way`: factura + PO.
- `3-way`: factura + PO + recepción.
- `none`: no existe referencia verificable.

Las diferencias de cantidad, precio e impuesto se conservan en `matchResult`. No se corrige silenciosamente el documento ni el PO/recepción. Cuando no existen líneas estructuradas suficientes se registra explícitamente `lines_unavailable` en lugar de fingir igualdad.

## Confidence y revisión

Todo campo extraído tiene `{ value, confidence, source }`. El umbral actual de revisión es `0.80`. Antes de crear el borrador, cada campo por debajo del umbral debe aparecer en `confirmedFields` o tener una corrección explícita en `corrections`. Número de factura y moneda faltantes se consideran bloqueantes. La UI resalta la cantidad de campos por confirmar.

## Retención y backup

`retentionUntil` se calcula con `PAYABLE_RETENTION_DAYS` (3650 días por defecto). La retención definitiva para producción sigue subordinada a la política legal/contable validada por #29; el sistema conserva, no elimina automáticamente, el original en este ticket.

Al almacenarse en PostgreSQL, `PayableDocument` y `PayableParserRun` entran en el alcance del backup lógico cifrado/off-site y restore drill existente de ContaGest. Cualquier cambio futuro que externalice blobs deberá ampliar el manifiesto de backup/restore antes de activarse.

## Evidencia QA

El gate `.github/workflows/payables-v235.yml` levanta PostgreSQL 17 efímero, aplica migraciones y ejecuta:

- `backend/src/modules/payables/payables.parser.test.ts`: parsing, confidence, MIME spoofing, contenido activo y tamaño.
- `qa/payables-v235-accuracy.test.ts`: exactitud por campo sobre corpus sintético/sanitizado VES/USD.
- `qa/payables-v235.integration.test.ts`: aislamiento A→B/B→A, dedupe exacto, duplicate supplier+reference, proveedor desconocido, 3-way matching y ausencia de auto-post.
- `qa/payables-v235.spec.mjs`: comportamiento de UI para upload, baja confianza, revisión y creación exclusiva de borrador.

El reporte de exactitud se conserva como artifact ligado al SHA. Ninguna prueba usa documentos reales con PII comercial.

## Limitaciones explícitas

- El parser local v1/v2 no es OCR visual general; imágenes requieren confirmación humana hasta disponer de un provider aprobado.
- El matching reutiliza órdenes/recepciones ya representadas como `ModuleRecord`; una futura normalización de compras debe migrar estas referencias sin perder provenance.
- La política legal definitiva de retención y cualquier OCR externo dependen de #29.
