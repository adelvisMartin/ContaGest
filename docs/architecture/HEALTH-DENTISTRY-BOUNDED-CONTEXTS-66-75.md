# Health + Dentistry bounded contexts · 66/75

## Purpose

Implementation 66/75 decomposes the shared Health/Dentistry router on top of `main@4fbd55b51cf862b379b67fc527fb8f4d8912fe99` without changing public HTTP contracts, permission checks, tenant scoping, SQL, lifecycle rules or financial behavior.

## Backend ownership

| Context | Owner | Responsibility |
| --- | --- | --- |
| core | `health-core.routes.ts` | summary, patients, professionals and appointment scheduling |
| encounters | `health-encounters.routes.ts` | clinical encounters, amendments, review/sign lifecycle and treatment-plan decisions |
| dental financial | `health-dental-financial.routes.ts` | financial analytics and accepted-plan → draft-invoice linkage |
| measurements | `health-measurements.routes.ts` | measurements, veterinary vital batches and immunizations |
| shared route helpers | `health.route-helpers.ts` | appointment locks/conflict detection, dental lifecycle normalization and financial aggregation |

`health.routes.ts` is now a composition root only. Child routers preserve the original registration order.

Every endpoint keeps its existing `health.manage` guard. Dental financial read/write endpoints additionally keep `sales.view` and `sales.manage` respectively.

`health.schemas.ts` remains request-validation authority. Shared financial calculation remains in `shared/financial/invoice.ts` and decimal serialization in `shared/financial/decimal.ts`.

## Frontend ownership

`DentistryPracticePage.jsx` remains the only state/service orchestrator. Existing focused components continue to own schedule, lifecycle, treatment plan, periodontogram, consent, media and financial UX.

The repeated metric primitive moved to `DentistryWorkspacePrimitives.jsx`; it is visual-only and owns no state or service calls.

## Contract invariants

1. All 20 methods/paths are preserved in original order.
2. Every endpoint keeps exactly one `health.manage` gate.
3. Dental financial routes retain their secondary sales permissions.
4. SQL, transactions, advisory locks, append-only clinical history and draft-invoice semantics are moved without behavior edits.
5. Request schemas remain centralized in `health.schemas.ts`.
6. The frontend keeps one Dentistry state/service owner.
7. No skip/only/fixed sleep/forced interaction/timeout inflation is introduced.

## Regression

`tests/health_dentistry_bounded_contexts_66_75.test.mjs` locks route parity, authorization parity, composition-root purity, helper authority, schema/financial boundaries and frontend ownership.

Runtime, PostgreSQL, browser, build and CI are PASS only when those gates execute against the exact final SHA.

## Merge order

66/75 must follow 61/75 → 62/75 → 63/75 → 64/75 → 65/75. Before merge it must be reconciled onto the resulting `main` and revalidated on that exact SHA.
