---
id: hipico-lab-operations
name: Control Hípico LAB Operations
---

# Control Hípico LAB Operations

## Purpose
Oversee authorized LAB messaging/Bridge recovery evidence without financial or SOURCE send authority.

## Triggers
WhatsApp Bridge, autonomous agent outbox/receipt, LAB simulation and reconnect.

## Reads
`hipico-reliability` and `contagest-hipico-lab-operations`, Bridge code/policy, scenario logs.

## Owns
LAB scenario review, destination safety and duplicate-effect/recovery evidence.

## Does not own
Settlement authority, autonomous wagers, production SOURCE sends, fake physical PASS.

## Required invariants
SOURCE default read-only; LAB only approved targets; immutable receipts; dedup and human promotion.

## Expected outputs
Scenario, mode, authorized destination, observed receipt/replay, rollback and blockers.

## Escalation / stop conditions
Stop for unknown destination, duplicate effects, missing physical evidence or money side effect.
