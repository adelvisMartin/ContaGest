# ContaGest Enterprise Data UI v1

Issue: #621. Public React authority: `frontend/src/components/vnext/index.js`.

## Decision

ContaGest uses `CgTable` for bounded/simple tabular data and `CgDataGrid` as the canonical server-query adapter when pagination/query state is required. **No MUI X dependency required** for the current pilots: the measured scope is covered by MUI Core, so Pro/Premium features, licensing and bundle cost are intentionally avoided.

## Query contract

`dataContracts.js` keeps pagination modes explicit (`page` or `cursor`), caps page size, preserves string filter values and serializes sort/filter/search deterministically. Routes/services remain responsible for translating this canonical UI query state to their existing API contract. The UI never invents allowlists, authorization, balances or business filters.

## Async states

Use `CgSkeleton`, `CgInlineError`, `CgRetryState` and `CgNoResults` for loading/error/retry/no-results. Empty dataset and no-results-after-filter are distinct states. Correlation IDs may be shown when the backend exposes a safe identifier.

## Data primitives

- `CgTable`: bounded/simple table, sticky header, numeric alignment and keyboard row activation when row actions exist.
- `CgDataGrid`: canonical composition of table + server pagination state; no client-side unlimited dataset assumption.
- `CgPagination`: page/pageSize contract with bounded sizes.
- `CgSearchField`: controlled search with optional debounce/cancellation responsibility kept at the caller/service layer.
- `CgToolbar` / `CgCommandBar`: responsive command composition.
- `CgKpi`, `CgMetricGrid`, `CgStatusSummary`: presentation only; no business calculations.
- `CgDetailList`: responsive key/value presentation.

## Migration pilots

1. `AuditPage`: both preflight and failure-log tables now render through `CgLegacyTable`, which is a compatibility adapter owned by the canonical `CgTable` migration path.
2. `ApprovalsPage`: inbox, own requests and aging report no longer build raw route-local table markup; service calls and approve/reject authority remain unchanged.

The legacy bridge marks rendered tables with `data-cg-data-authority="CgTable"` so browser/source audits can detect canonical ownership during the strangler migration.

## Accessibility and responsive behavior

Headers use `scope="col"`; table containers scroll horizontally instead of clipping; empty/error/loading states expose status/alert semantics; row activation supports Enter/Space when enabled. React toolbars collapse to a vertical layout on small viewports. Theme, reduced motion and focus appearance remain inherited from the #631/#619 canonical theme/component authority.

## Performance baseline

This ticket adds **zero runtime dependencies** and no MUI X package. Virtualization is not enabled because neither pilot demonstrated a measured need. Page-size normalization caps requests at 200 rows, preventing the canonical adapter from implying unbounded browser datasets. Future virtualization requires measured render/query evidence and must remain behind `CgDataGrid` rather than direct route imports.

## Do / don't

Do keep service/query authority outside the UI, serialize query state deterministically, preserve string identifiers, use server-side pagination for large endpoints, and keep actions permission-aware without treating UI state as authorization.

Don't add route-local raw tables to migrated surfaces, import MUI X directly from pages, mix cursor/page pagination silently, download unlimited datasets when a paginated API exists, or move financial/authorization calculations into `Cg*` components.

## Preventive control

`tests/enterprise_data_ui_issue_621.test.mjs` and `scripts/enterprise-data-ui-authority-audit-v621.mjs` fail when required exports disappear, commercial MUI X authority appears, the pilots revert to parallel table owners, or approval service calls are lost. The contract is wired into `scripts/run-authoritative-contracts.mjs`.
