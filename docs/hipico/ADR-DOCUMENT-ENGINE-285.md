# ADR — Document/PDF Intelligence Engine (#285)

## Status
Accepted and integrated with the #290 production-hardening extraction runtime. Production promotion remains gated by exact-SHA evidence.

## Decision
Control Hípico treats every PDF as hostile evidence. The canonical boundary is `/api/v1/hipico/documents*`; raw bytes remain backend-only in PostgreSQL. Document content can produce structured evidence, but it never writes balances, settlements or authoritative race state directly.

## Extraction runtime
#290 supersedes the earlier package-based extractor design. Native PDF extraction uses the installed system Poppler tools (`pdfinfo`, `pdftotext`, `pdftoppm`) and OCR uses the installed `tesseract` executable. The workflow installs `poppler-utils`, `tesseract-ocr` and `tesseract-ocr-eng` explicitly.

The application detects those capabilities at runtime. Missing native/OCR tooling is reported as degraded/not configured (`POPPLER_NOT_INSTALLED` or `OCR_RUNTIME_NOT_INSTALLED`); it is never reported as PASS. The canonical document route delegates to the hardened engine/extractor/store under `hipico-bot` so there is one extraction implementation, not a duplicate PDF stack.

## Authority
Text such as `RESULTADO OFICIAL` is a claim, not authority. `OFFICIAL_RESULT` requires provenance `authority=official` and an allowlisted official source channel. Lower-authority evidence is downgraded to `RESULT` while preserving the claimed-official signal in extraction evidence.

## Persistence and immutability
`hipico_documents` stores SHA-256, bounded metadata, classification, parser version, authority, extraction and original bytes. `hipico_document_sources` records source occurrences. Duplicate SHA is idempotent, revisions use `supersedes_id`, and immutable-evidence triggers prevent rewriting original evidence.

## Security bounds
- MIME route plus `%PDF-` magic/structure validation.
- Maximum 10 MiB and bounded page count.
- Active-content markers such as JavaScript, EmbeddedFile, Launch/OpenAction and RichMedia are rejected before extraction.
- Extraction runs with timeout/AbortSignal, bounded output and temporary-file cleanup.
- Raw PDF is denied to browser-authenticated roles; canonical API requires the operator token.
- No document text is executed as SQL, shell, admin instruction or tool command.

## Rollback
Revert code before deployment. Once evidence rows exist, do not drop document tables automatically; export/migrate evidence explicitly.
