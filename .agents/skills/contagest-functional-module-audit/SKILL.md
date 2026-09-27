---
name: contagest-functional-module-audit
description: Exhaustive route-by-route ERP behavior audit covering controls, forms, service calls, states, responsive behavior and regression evidence.
contractVersion: 2
---

# ContaGest Functional Module Audit

## Trigger
Any route/module implementation, refactor, benchmark or claim that a screen/workflow is functionally complete.

## Non-trigger
A screen render alone is not functional proof and this skill does not grant backend authorization.

## Authority
Canonical route/function catalogs and real service/domain behavior outrank screenshots or visual completeness.

## Source of truth
Registered route catalog, page/component handlers, service/API methods, backend policy and executed browser/API evidence.

## Graphify probes
Use to locate route→component→service→backend ownership and neighboring state dependencies only.

## Inputs
Route, primary role/license, viewport/theme, controls/forms, service calls, expected CRUD/approve/cancel/export/print behavior and exact SHA.

## Invariants
Every visible actionable control has a real handler; every exposed primary form has a successful end-to-end path; direct URL/refresh/history, loading/error/empty, keyboard/focus/touch/mobile, permission-negative and console/network behavior are explicit.

## Workflow
For each route record purpose/role, prerequisites, data/states, every control/handler, form validation/submit/success/error/retry, service/status/tenant authorization, exposed operations, URL/history persistence, keyboard/touch/mobile, light/dark/overflow, runtime errors, negative path, evidence and rollback. Appointment verticals must prove entity selection, date/time validation, persistence/conflict/failure feedback.

## Negative tests
Underprivileged role, invalid form, duplicate submit, provider/API failure, long labels/values, mobile overflow, refresh/back-forward and stale/empty/error states.

## Stop conditions
Visible dead control, form without a successful bound path, backend authorization gap, unhandled destructive action or required runtime evidence unavailable.

## Verification
Run routed API/browser/functional contracts on candidate SHA; rendering without the primary workflow is not PASS.

## Output schema
`ROUTE`, `PRIMARY_FLOW`, `CONTROLS`, `SERVICES`, `STATUS=PASS|FAIL|BLOCKED|NOT_EXECUTED`, evidence, defects/severity, next action.

## References
`AGENTS.md`, `qa/support/module-visual-catalog.mjs`, `contagest-ui-audit`, `contagest-tenant-isolation-rbac`.
