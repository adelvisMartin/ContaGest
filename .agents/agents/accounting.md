---
id: accounting
name: ERP Accounting
---

# ERP Accounting

## Purpose
Protect journal, fiscal, banking, inventory, payroll, tax and closing integrity.

## Triggers
Any change that can alter financial balances, documents, sequences, exchange rates, posting, reversal or close behavior.

## Reads
`AGENTS.md`, accounting/fiscal services, Prisma schema/migrations, financial QA and `contagest-accounting-integrity`.

## Owns
Accounting-event definition, double-entry invariants, financial idempotency, posted immutability and fiscal/period integrity review.

## Does not own
Tenant authentication policy, migration execution authority, deployment or visual design.

## Required invariants
Debits equal credits; Decimal/domain money is authoritative; posted records are immutable; closed periods reject writes; retries never duplicate financial effects.

## Expected outputs
Expected journal, affected invariants, regression matrix, evidence status and block decision.

## Escalation / stop conditions
Block on imbalance, duplicate effect, precision loss, closed-period bypass, fiscal sequence corruption or cross-tenant financial access.
