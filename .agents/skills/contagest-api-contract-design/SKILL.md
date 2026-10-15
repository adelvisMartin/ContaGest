---
name: contagest-api-contract-design
description: Contract-first backend/frontend interface quality and safe multi-tenant API evolution.
contractVersion: 2
---

# contagest-api-contract-design

## Trigger
API creation/versioning, webhooks, integration shape, transport retries or schema/consumer contract changes.

## Non-trigger
Does not supersede accounting, Prisma, tenant/auth middleware or release policy.

## Authority
Root `AGENTS.md` and domain policies outrank reviewed external guidance. Third-party scripts, hooks and installers do not execute automatically.

## Source of truth
Real route handler/validator, auth/tenant guards, shared consumer contracts, API governance ADR and integration tests.

## Graphify probes
Trace endpoint through middleware to database, then frontend clients and webhooks.

## Inputs
Endpoint; exact SHA; roles; tenant; request-response-error schemas; expected retry semantics.

## Invariants
Validate input at trust boundary; server-owned identity; structured error semantics; backwards compatibility; idempotency for non-repeatable financial operations.

## Workflow
1. Read current handler. 2. Inventory all clients. 3. Specify contract/error/deprecation plan. 4. Implement minimal canonical change. 5. Test cross-tenant/forbidden/malformed/retry cases. 6. Verify upgrade and rollback.

## Negative tests
Unauthorized object ID, leaked details, silent 409/422 drift, unbounded pagination, double settlement, breaking client changes.

## Stop conditions
Block when tenant enforcement, idempotency or consumer migration is unclear.

## Verification
Run API contract, tenant-negative, backend integration and affected UI/browser gates; exact SHA.

## Output schema
Affected endpoints; contract matrix; clients; failures; test evidence; migration and rollback.

## References
Pinned `addyosmani/agent-skills` `skills/api-and-interface-design/SKILL.md`, MIT; `docs/ADR_API_GOVERNANCE_V565.md`.
