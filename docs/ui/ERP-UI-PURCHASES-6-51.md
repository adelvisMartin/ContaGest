# 6/51 · Compras + Cuentas por pagar React Cg/MUI

## Objetivo

Migrar `compras` y su panel embebido de documentos por pagar a un único lifecycle React sin modificar contratos contables ni la autoridad de posting.

## Contratos preservados

Compras:
- `SupabaseSyncService.pullPurchases/createPurchase`;
- fallback controlado mediante `RuntimePolicy`;
- borrador local `uid('pur')`;
- borrado de borrador mediante `PurchaseOperationsService.deleteDraft`;
- anulación/reverso mediante `PurchaseOperationsService.cancel`.

Payables:
- list/upload/original/reprocess/review/reject;
- límite de 8 MiB;
- dedupe;
- confirmaciones de baja confianza;
- diferencias PO/recepción visibles antes de revisar;
- revisión crea sólo borrador y luego sincroniza compras; nunca auto-post.

## UI

Los prompts/confirms y listeners DOM fueron reemplazados por estado React y `CgDialog`. Tablas y acciones usan Cg*/MUI con contención responsive.

## QA

Source contract/audit requerido. Browser 360/390/430/768/1366 permanece `NOT_EXECUTED` mientras #134 bloquee runners.
