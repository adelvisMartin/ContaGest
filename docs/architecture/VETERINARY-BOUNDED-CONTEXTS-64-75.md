# Veterinary bounded contexts · 64/75

## Purpose

Implementation 64/75 decomposes the Veterinary vertical without changing its HTTP, RBAC, tenant, persistence, UI or response contracts. The refactor starts from `main@25c5f705df0bf6da9f5bdac85ed98bd738469d2a`, after the Veterinary schema-authority extraction merged in #513.

The existing mount authorities remain unchanged:

- `/api/v1/verticals/veterinary/*` continues to be mounted by the `veterinary` entry in `backend/src/modules/route-manifest.ts`.
- Veterinary patient/appointment CRUD continues to be mounted by the `veterinary-crud` entry at `/api/v1/verticals/*`.
- `requireTenant` and `requirePermission('health.manage')` remain parent guards and execute before every bounded-context child router.

## Backend ownership

| Context | Owner |
| --- | --- |
| medication + clinical inventory | `veterinary-inventory.routes.ts` |
| dashboard summary | `veterinary-overview.routes.ts` |
| lab + diagnostic studies | `veterinary-diagnostics.routes.ts` |
| hospitalization lifecycle | `veterinary-hospitalization.routes.ts` |
| inpatient treatment sheet | `veterinary-treatment-sheet.routes.ts` |
| observations + procedures | `veterinary-patients.routes.ts` |
| guardian grants | `veterinary-guardian.routes.ts` |
| communication log | `veterinary-communications.routes.ts` |
| appointment status lifecycle | `veterinary-appointments.routes.ts` |
| boarding | `veterinary-boarding.routes.ts` |
| financial cases | `veterinary-financial.routes.ts` |
| patient patch/archive CRUD | `veterinary-crud-patients.routes.ts` |
| appointment patch/delete CRUD | `veterinary-crud-appointments.routes.ts` |

`veterinary.routes.ts` and `veterinary-crud.routes.ts` are composition roots only. They must not contain SQL, Prisma calls, endpoint handlers or alternate access policy.

## Frontend ownership

`VeterinaryWorkspace.jsx` remains the state/service orchestrator and the single rendered workspace owner. Presentation is split into:

- `VeterinaryWorkspaceViews.jsx`: bounded-context tab views.
- `VeterinaryWorkspaceDialogs.jsx`: patient, professional, appointment and clinical form rendering.
- `VeterinaryWorkspacePrimitives.jsx`: shared labels, date helpers and visual primitives.
- Existing focused panels continue to own medication, clinical inventory, finance, guardian portal, boarding and treatment-sheet UX.

No second DOM owner, legacy renderer or parallel state store is introduced.

## Contract invariants

1. Methods, paths and handler bodies are preserved.
2. Tenant scoping remains mandatory and parent-authoritative.
3. `health.manage`, `inventory.manage`, `communications.manage`, `admin.manage`, `sales.view` and `sales.manage` checks remain at their pre-refactor boundaries.
4. SQL, transactions, audit writes, inventory locks and financial calculations are moved without semantic edits.
5. API response helpers and error codes/messages are preserved.
6. The frontend keeps the same services, URL state, loading/error/success flows and one `.cg-veterinary-workspace` root.
7. No `skip`, `only`, fixed sleep, forced interaction or timeout inflation is permitted as validation compensation.

## Regression authority

`tests/veterinary_bounded_contexts_64_75.test.mjs` locks:

- all 43 `/verticals/veterinary` route signatures;
- all 4 Veterinary CRUD route signatures;
- parent security-boundary ordering;
- persistence-free route aggregators;
- workspace single ownership and decomposition;
- absence of bypass patterns introduced by the refactor.

The test is included in `scripts/run-authoritative-contracts.mjs`.

## Merge order

64/75 may be developed while the earlier gates are pending, but it must not be merged ahead of 60/75 → 61/75 → 62/75 → 63/75. Before merge, the branch must be reconciled onto the resulting `main` and all required exact-SHA checks must execute on that final candidate.
