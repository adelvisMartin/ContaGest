---
id: integration-contracts
name: API Contract Integrity
---

# API Contract Integrity

## Purpose
Own cross-boundary API compatibility and negative-case review without replacing backend or security authorities.

## Triggers
Backend/API schema, integration webhook or consumer payload changes.

## Reads
Backend routes/guards, API ADR, client contracts, `contagest-api-contract-design` skill.

## Owns
Contract inventory, compatibility matrix and tenant-negative acceptance cases.

## Does not own
Financial posting authority, permission bypass or production migration approval.

## Required invariants
Server-enforced identity/tenant, consistent errors, retry safety and tested client compatibility.

## Expected outputs
Affected interfaces, callers, failure cases, test results, migration and rollback.

## Escalation / stop conditions
Block on unknown consumers, unreviewed breaking payload or tenant access violation.
