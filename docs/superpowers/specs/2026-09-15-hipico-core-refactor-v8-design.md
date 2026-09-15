# Control Hípico Core Refactor v8 — Design

## Goal

Refactor the core Control Hípico code accumulated through implementations 1–7 for readability, maintainability and testability without removing functionality, renaming public functions, changing route paths, changing essential request/response fields, weakening safety gates, or changing persisted behavior.

## Scope

This is a behavior-preserving refactor. It targets the high-complexity control-plane modules that now concentrate multiple responsibilities:

- `backend/src/modules/hipico/agent-policy.ts`
- `backend/src/modules/hipico/automation.store.ts`
- `backend/src/modules/hipico/agent.routes.ts`
- `backend/src/modules/hipico-bot/hipico-outbox.store.ts`
- directly related tests/workflows

No database schema change is required. Existing v22/v23/v24 migrations remain authoritative and untouched.

## Compatibility invariants

The following public names remain import-compatible from their current files:

- `AUTOMATION_STATES`, `AGENT_TOOLS`, `AUTO_EXECUTABLE_TOOLS`, `MIN_AUTO_CONFIDENCE`
- `canPromoteAutomation`, `validateModelCandidate`, `agentCanAct`, `safeToolRequest`, `HipicoAgentEngine`
- `AutomationStore` and its public methods
- `sanitizeAgentEvidence`
- `configuredOutboxOwnerId`, `sameCanonicalOutboundIntent`, `canonicalOutboxReadiness`, `enqueueCanonicalOutbound`, `getCanonicalOutbox`, `listCanonicalOutbox`, `claimCanonicalOutbound`, `markCanonicalAccepted`, `markCanonicalRetry`, `markCanonicalFailed`, `markCanonicalReconciliationRequired`, `recordCanonicalReceipt`, `reconcileCanonicalOutbound`
- `CanonicalOutboundInput`

All existing route paths, HTTP status mapping, error codes, JSON fields and idempotency semantics remain unchanged. Additive fields introduced by v6/v7 remain unchanged.

## Architecture

### Agent policy facade

`agent-policy.ts` becomes a compatibility facade. Internals are split by responsibility:

- `agent-contracts.ts`: public constants and types only.
- `agent-tools.ts`: model candidate validation, auto-action predicate and tool argument sanitization.
- `promotion-policy.ts`: promotion gates and metric-rate evaluation.
- `agent-evaluator.ts`: `HipicoAgentEngine` orchestration and deterministic/model selection.

`agent-policy.ts` re-exports the same public API so existing imports do not change.

### Automation store

`AutomationStore` remains the public persistence API. Internal concerns are extracted:

- `automation-scope.ts`: scope validation, SOURCE pinning/default mode, advisory-lock key.
- `automation-evidence.ts`: evidence sanitization and transition signature.
- `automation-metrics.store.ts`: historical/recent/by-intent SQL aggregation and mapping.

The transaction boundary for `setMode` remains exactly where it is: scope lock → persisted idempotency lookup → current mode read → metrics read → promotion decision → optional mode update → append-only transition event.

### Agent HTTP routes

`agent.routes.ts` remains the route registration file. Pure HTTP concerns move to `agent-http.ts`: Zod schemas, owner/group/idempotency parsing, SOURCE read-only detection, server risk context, error-to-status mapping. Security middleware behavior and response payloads remain unchanged.

### Canonical outbox store

`hipico-outbox.store.ts` keeps all public database functions. Pure normalization/validation moves to `hipico-outbox-input.ts`; receipt/reconciliation input normalization moves to `hipico-outbox-receipt-input.ts`. The DB lease, idempotency, receipt monotonicity and reconciliation semantics do not change.

## Clean-code rules

- One responsibility per helper/module.
- Prefer named helpers over compact one-line logic.
- No new dependency.
- No speculative abstraction outside the touched Hípico control plane.
- No changes to SQL predicates, state names, thresholds, error codes or persistence authority unless required to preserve exact behavior after extraction.
- Avoid circular imports by putting shared constants/types in contract modules.

## Characterization strategy

Before production extraction, add tests that lock the existing public surface and representative behavior:

1. agent-policy exports and exact promotion decisions;
2. candidate validation/tool sanitization error codes and successful payloads;
3. `AutomationStore` public method names and evidence sanitizer behavior;
4. route helpers/status mapping and strict-body behavior through source contracts;
5. canonical outbox input normalization, idempotency comparison and invalid-input errors;
6. SOURCE SHADOW-only, dual-window v7 gates, v6 risk decisions and v5 canonical outbox tests continue unchanged.

Structural tests may require the new internal modules and therefore provide the RED signal for the refactor while behavior-characterization assertions already pass on the pre-refactor implementation.

## Verification

The final candidate must attempt, on the exact SHA:

- backend typecheck;
- full `test:hipico` suite;
- Agent PostgreSQL integration (`test:hipico:agent`);
- canonical outbox PostgreSQL integration when the existing script/environment is available;
- backend build;
- `git diff --check`;
- exact-SHA GitHub Actions workflow.

If GitHub Actions again reports `runner_id=0` / no executed steps, classify it as `BLOCKED_INFRASTRUCTURE`, never as PASS.

## Non-goals

- No feature work.
- No new automation authority.
- No monetary authority.
- No migration rewrite.
- No endpoint rename.
- No frontend visual redesign.
- No broad formatting sweep outside the files above.
