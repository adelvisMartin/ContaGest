---
name: contagest-functional-module-audit
description: Exhaustive route-by-route ERP behavior audit covering controls, forms, service calls, states, responsive behavior and regression evidence.
---

# ContaGest Functional Module Audit

## Purpose
Prevent “looks implemented” modules that cannot complete their main user workflow. Every registered route must have an explicit functional contract and evidence.

## Per-route checklist
1. Purpose and primary user/role.
2. Route/access/license prerequisites.
3. Data dependencies and empty/loading/error states.
4. Every visible input/select/checkbox/button/link and its handler.
5. Every form: validation, submit binding, success state, error state, duplicate prevention and retry behavior.
6. API/service methods called, expected status codes and tenant authorization.
7. Create/read/update/delete/approve/cancel/export/print flows that the screen exposes.
8. Direct URL, refresh, back/forward and state persistence.
9. Keyboard/focus/touch/mobile behavior.
10. Light/dark visual state and no clipping/overflow.
11. Console/network errors.
12. Negative/permission path.
13. Evidence and rollback.

## Critical interaction rule
A visible control without a real handler or a form without a successful end-to-end path is a defect, even when the screen renders correctly.

## Appointment modules
Health/Veterinary/Psychology/Dentistry must prove patient/entity selection, date/time validation, successful create request, duplicate/conflict behavior, visible update of agenda, persistence after refresh and failure feedback. IDs may be values, never human-facing labels when a display identity exists.

## Output per route
`ROUTE`, `PRIMARY_FLOW`, `CONTROLS`, `SERVICES`, `PASS|FAIL|BLOCKED|NOT_EXECUTED`, evidence, defects by severity and next action.
