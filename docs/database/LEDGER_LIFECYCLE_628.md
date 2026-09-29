# Ledger lifecycle authority — #628

State machine: `document -> DRAFT ledger -> validate -> POSTED -> immutable -> compensating reversal`.

`POSTED -> DRAFT` is illegal. Posted lines and economic identity are immutable at DB level. Corrections are new compensating entries linked by `reversalOfId`; posted history is never rewritten/deleted.

## Authority
- Domain commands: `backend/src/modules/accounting/accounting.service.ts`.
- Posted immutability/balance: migration `20260827060000_issue_91_ledger_posting_immutability`.
- #628 DB-bypass hardening: `20260929193000_issue_628_ledger_lifecycle_hardening`.
- Reconciliation: `scripts/audit-ledger-lifecycle-628.mjs`, read-only aggregate output.

## Concurrency and identity
Non-manual effects are unique by `(tenantId, source, sourceId)`. Service retry handling resolves Prisma `P2002` to the existing winner. `reversalOfId` is unique, so one original has at most one reversal effect.

## Closed periods
Service commands reject closed periods. DB triggers additionally reject direct-SQL LedgerEntry creation and LedgerLine mutation in a closed period; the existing posting gate rejects DRAFT -> POSTED. API bypass therefore cannot introduce a financial effect in a closed period.

## Reversal
At posting, a reversal must reference a posted original in the same tenant/period and must exactly compensate grouped account/currency/exchange-rate debit/credit amounts. Stable DB contract codes: `LEDGER_DUPLICATE_EFFECT`, `PERIOD_CLOSED`, `REVERSAL_SOURCE_INVALID`, `CROSS_TENANT_LEDGER_REFERENCE`.

## Reconciliation categories
`DOCUMENT_WITH_VALID_LEDGER`, `DOCUMENT_WITH_DRAFT_LEDGER`, `DOCUMENT_WITHOUT_LEDGER`, `LEDGER_WITHOUT_SOURCE`, `UNBALANCED_LEDGER`, `POSTING_ELIGIBLE`, `REQUIRES_MANUAL_ACCOUNTING_DECISION`.

No missing document->ledger relationship is fabricated. A document without a provable ledger link remains a manual accounting decision.

## Recovery
Forward-only. Recovery is a corrective migration replacing only the #628 guards after preserving evidence. Never use `db reset`, `db push`, `TRUNCATE`, delete posted entries, or rewrite posted lines.
