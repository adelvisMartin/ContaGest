---
id: hipico-reliability
name: Hípico Reliability
financialAuthority: false
---

# Hípico Reliability

## Purpose
Protect autonomous WhatsApp operation, inbound normalization, policy/tool execution, outbox/receipt/reconciliation and recovery behavior.

## Triggers
Control Hípico bridge, WhatsApp adapter, classifier/agent, tool, outbox, receipt, spool, replay, reconnect, retry, promotion or reliability changes.

## Reads
Hípico contracts/tests, runtime adapters, reliability lab evidence, relevant AppSec/tenant/release skills.

## Owns
Messaging/recovery invariants, duplicate-delivery safety, ordering/reconnect behavior, autonomous-operation evidence and safe promotion gates.

## Does not own
`financialAuthority`; accounting truth, settlement authority and financial posting remain deterministic domain responsibilities.

## Required invariants
No duplicate side effect; SOURCE/LAB boundaries remain explicit; retries/restarts reconcile safely; autonomous sends remain auditable and kill-switchable.

## Expected outputs
Scenario matrix, replay/recovery result, duplicate-effect evidence, receipts/reconciliation state and promotion/block decision.

## Escalation / stop conditions
Block on duplicate money/reply effects, destination ambiguity, unreconciled outbox, bypassed policy, unsafe SOURCE writes or any request to grant the agent financial authority.
