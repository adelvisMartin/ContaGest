# #621 Enterprise Data UI — Design

**Issue:** #621  
**Baseline:** `main@fc231a964f4c8dbce3387f2afa5f0f33e13f8f1d`  
**Depends on:** #619 Component Library vNext and #620 Forms & Interaction Library.

## Intent

Establish one canonical presentation/query-state layer for ContaGest data-heavy surfaces without moving authorization, accounting, filtering authority, balances, exports, or domain calculations into the browser. The first migration pilots are `AuditPage` and `ApprovalsPage` because both are operationally dense and exercise distinct static/async table flows without making a financial posting screen the first adopter.

## Architecture

```text
server/domain query model
  -> route/service compatibility adapter
    -> canonical UI query state
      -> CgTable / CgDataGrid
        -> CgPagination / query callbacks / canonical feedback states
```

`frontend/src/components/vnext/index.js` remains the public component authority. Data primitives live in focused modules under `frontend/src/components/vnext/`. Existing string-rendered pages may use a compatibility renderer during migration, but new route-local table/grid/query-state implementations are not allowed when the canonical primitive applies.

## Decision: Table vs DataGrid

- `CgTable`: default for bounded/simple tables, semantic HTML, modest datasets and compatibility pilots.
- `CgDataGrid`: adapter only when evidence requires richer server-side pagination/sort/filter, column visibility, density or virtualization. No direct route import of MUI X once the adapter exists.
- Do not add Pro/Premium features or a commercial dependency.
- Virtualization is not default; it requires a measured large-dataset need.

## Query contract

Canonical query state is explicit and serializable:

- pagination mode is either page/pageSize or cursor, never both silently;
- sort entries preserve field names as strings and direction as `asc|desc`;
- filters are declarative `{field,operator,value}` records and serialize deterministically;
- searches are strings; debounce/cancellation stays at route/service adapter level when needed;
- page size is bounded by the caller/server contract;
- UI never invents server allowlists or permissions.

## Canonical primitives

- `CgTable`, `CgDataGrid`, `CgPagination`;
- `CgKpi`, `CgMetricGrid`, `CgStatusSummary`;
- `CgToolbar`, `CgCommandBar`, `CgSearchField`;
- `CgSkeleton`, `CgInlineError`, `CgRetryState`, `CgNoResults`;
- `CgDetailList`;
- pure query helpers for pagination/sort/filter serialization.

## States

Every data surface has an explicit `loading | success | empty | no-results | error` presentation. Permission denial remains a server response/route concern and is presented without turning the table into authorization authority.

## Responsive/accessibility

- Tables keep semantic header/cell relationships and numeric alignment.
- Mobile fallback uses horizontal containment or card/detail projection only when column semantics remain clear.
- No fixed widths that make 390/430 px or 200% zoom unusable.
- Keyboard focus remains visible for row actions, search, filters and pagination.
- Sticky headers/toolbars must not occlude focused elements.
- Light/dark/system and reduced-motion continue to come from the canonical theme.

## Pilots

1. `AuditPage`: migrate `ErpDataTable` consumers for preflight checks and failure log to the canonical compatibility renderer while preserving current calculations/actions.
2. `ApprovalsPage`: replace route-local `<table>` builders with canonical data rendering and canonical loading/error/no-results feedback while preserving `ApprovalsService` calls and decision actions.

No pilot changes backend endpoints, RBAC rules, calculations or persistence.

## Performance/bundle

Record the dependency/bundle decision before adding MUI X. Baseline for this ticket is “no MUI X dependency required” unless repository evidence proves otherwise. Query call count for the pilots must not increase; initial render must not introduce duplicate service calls.

## Verification

- source/contract tests for query serialization, canonical exports, no direct MUI X route imports, pilot adoption and duplicate local table prevention;
- exact-SHA source/diff review;
- build/browser/Playwright where executable;
- external Actions that remain queued are `BLOCKED_INFRASTRUCTURE`, not PASS.