# Control Hípico — AnyDoc + Archify + PDF WhatsApp Design

## Goal

Integrar Firecrawl AnyDoc como extractor documental local del motor canónico de Control Hípico, automatizar la ingestión segura de PDFs recibidos por el WhatsApp Web Bridge, e integrar Archify como tooling reproducible para documentación de arquitectura y revisión de orquestación. Ninguna de estas capacidades puede conceder autoridad financiera ni alterar el grupo SOURCE.

## Baseline

- Base exacta: `fix/hipico-285-287-recovery@dec9ec4969ce0d11f6520e58294390cf4d06ddc5`.
- API documental canónica existente: `/api/v1/hipico/documents*` y `DocumentIngestionService`.
- Bridge SOURCE existente: read-only/shadow; detecta `document` y nombre, pero actualmente sólo envía metadatos JSON.
- Extractor existente: Poppler para texto nativo y Tesseract local opt-in para OCR.
- AnyDoc estable fijado: `@firecrawl/anydoc@0.2.4`, MIT, Node >=20.
- Archify estable fijado: `tt-a1i/archify@v2.16.0`, MIT, tooling de ingeniería; no dependencia de runtime.

## Architecture

### PDF ingress

1. El Bridge inspecciona únicamente mensajes del grupo SOURCE configurado.
2. Si `mediaKind=document` y el nombre termina en `.pdf`, intenta descargar el archivo asociado al `data-id` exacto usando la UI de WhatsApp Web.
3. El archivo nunca se embebe como base64 en el evento JSON. Se envía por un endpoint separado con `Content-Type: application/pdf`, token del Bridge y metadatos de identidad acotados en headers.
4. El backend valida el token, la identidad SOURCE fija, el `ownerId` configurado en servidor, la metadata y los bytes con `validatePdfEnvelope` antes de persistir.
5. `DocumentIngestionService` mantiene SHA-256, dedupe, provenance, clasificación, parser, reconciliación y audit trail.
6. Un replay del mismo mensaje o del mismo PDF no puede producir efectos de dominio duplicados.

### Extraction provider

El backend expone una factoría de extractor con prioridad configurable:

- `anydoc`: `toMarkdownBytes(pdf, 'pdf', {ocr:'reject'})`; procesamiento local por defecto.
- `poppler`: extractor actual.
- `auto`: AnyDoc cuando está disponible; fallback a Poppler para runtime local conocido.

Cuando AnyDoc devuelve `needsOcr`, la política por defecto **no envía nada a Internet**. Puede caer al OCR local existente si está habilitado. El OCR hospedado de Firecrawl permanece desactivado salvo configuración explícita y documentada; incluso habilitado, nunca concede autoridad financiera.

### Archify

Archify vive fuera del runtime productivo. Se integra mediante tooling/version pin, doctor/validate y fuentes de diagramas versionadas. Los artefactos documentan topología y flujos; no se consideran evidencia de runtime por sí solos.

## Trust boundaries and invariants

- SOURCE es read-only; el Bridge nunca envía mensajes al grupo oficial.
- PDFs, AnyDoc, OCR, providers y agents mantienen `financialAuthority=false`.
- Nunca se deriva settlement, saldo, cierre monetario o apuesta confirmada de un PDF.
- El backend no acepta `ownerId`, `authority`, `groupKey` ni URL de descarga arbitraria enviados por el cliente para elevar autoridad.
- El owner del ingest automático proviene de `HIPICO_BRIDGE_OWNER_ID` validado como UUID.
- La identidad de grupo/canal debe coincidir con `HIPICO_SOURCE_GROUP_ID` + `HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY` y el LAB configurado.
- Máximo PDF: el límite canónico de 10 MiB existente; el Bridge aplica el mismo límite antes de transmitir.
- No se persisten tokens, URLs efímeras de media ni bytes en logs.
- Headers de provenance tienen límites estrictos y caracteres de control rechazados.
- Timeout y abort se aplican a descarga, transmisión y extracción.
- Cualquier ambigüedad de descarga/extracción produce revisión o reintento, nunca interpretación del caption como sustituto del archivo.
- OCR hospedado está OFF por defecto. Activarlo exige `HIPICO_DOCUMENT_ANYDOC_HOSTED_OCR_ENABLED=true` y credencial/configuración explícita; la guía debe advertir que el documento sale del host.
- La integración no elimina Poppler/Tesseract hasta demostrar paridad real y rendimiento en corpus Hípico.

## Error semantics

- PDF no descargable: el evento de texto/media sigue persistido en shadow y el documento queda `pending/retry`, sin efecto monetario.
- PDF inválido/activo/sobredimensionado: rechazo fail-closed con código estable.
- AnyDoc `needsOcr`: fallback local sólo si está configurado; de lo contrario `review`/error auditable.
- AnyDoc `encrypted`, `malformed`, `resourceLimit`, `unsupported`, `missingPart`: se mapean a códigos Hípico estables y auditables.
- Fallo de persistencia: 503/retryable; no ACK falso de documento procesado.

## Test strategy

- Unit: adapter AnyDoc, mapeo de errores, cero hosted OCR por defecto.
- Unit: validación de headers/identidad SOURCE/owner server-side.
- Unit: Bridge sólo auto-descarga PDF real; no imágenes/documentos no PDF ni historial.
- Contract: raw `application/pdf` no pasa por JSON body y conserva límites.
- Integration: ingest -> SHA/dedupe -> classification -> structured extraction, con `financialAuthority=false`.
- Deterministic campaign: 2000 casos seeded para aislamiento de grupos/mensajes, replay, tipo MIME, tamaño, clasificación y cero autoridad financiera.
- Physical: WhatsApp Web real, descarga PDF real, background/restart, spool/replay; sigue perteneciendo a #119.
- Soak: >=24h, spool/memory/backpressure; sigue perteneciendo a #120.

## Production gate

Esta integración no cambia los gates existentes: no se declara producción hasta tener exact-SHA green en unit/typecheck/build/integration, QA física #119, soak #120 y resolución de infraestructura CI #134. Branch protection y checks requeridos deben estar activos antes de permitir promoción automática.
