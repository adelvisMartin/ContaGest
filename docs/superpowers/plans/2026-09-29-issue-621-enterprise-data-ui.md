# #621 Enterprise Data UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the canonical data-heavy UI layer and migrate two real operational surfaces without changing backend/domain authority.

**Architecture:** Extend the #619/#620 `Cg*` authority with focused data/query-state modules. Keep simple bounded tables on semantic `CgTable`; introduce `CgDataGrid` only as an adapter boundary and only use MUI X if evidence justifies the dependency. Pilot AuditPage and ApprovalsPage through compatibility-safe rendering.

**Tech Stack:** React 19, MUI 9, Node 22 `node:test`, existing semantic tokens/theme.

**Spec:** `docs/superpowers/specs/2026-09-29-issue-621-enterprise-data-ui-design.md`

## Global Constraints

- No business, accounting, RBAC, tenant or persistence authority moves into UI.
- No Pro/Premium/commercial UI dependency.
- No MUI X dependency unless measured need is documented first.
- Server-side pagination/query contracts are preserved; do not silently download unbounded datasets.
- Existing service call counts must not increase during pilot migration.
- GitHub Actions/Vercel blocked by provider limitations are never represented as PASS.

## Review Focus

- Page/cursor pagination modes must never mix silently.
- Sort/filter serialization must be deterministic and string-preserving.
- Empty dataset and no-results-by-filter must remain distinguishable.
- Pilot migrations must preserve row actions/service calls and not duplicate queries.
- Mobile/zoom accessibility must not be traded for dense desktop layout.

---

### Task 1: Query-state contracts

**Files:**
- Create: `tests/enterprise_data_ui_issue_621.test.mjs`
- Create: `frontend/src/components/vnext/dataContracts.js`

**Interfaces:**
- Produces: `normalizePageQuery`, `normalizeCursorQuery`, `normalizeSortModel`, `normalizeFilterModel`, `serializeDataQuery`.

- [ ] Write failing tests for mutually exclusive pagination modes, stable sort/filter output, string IDs/values and bounded page size.
- [ ] Run focused test and verify RED because `dataContracts.js` does not exist.
- [ ] Implement only the pure helpers.
- [ ] Run focused test and verify GREEN.

### Task 2: Canonical table and feedback primitives

**Files:**
- Create: `frontend/src/components/vnext/data.js`
- Modify: `frontend/src/components/vnext/index.js`
- Test: `tests/enterprise_data_ui_issue_621.test.mjs`

**Interfaces:**
- Produces: `CgTable`, `CgDataGrid`, `CgPagination`, `CgSkeleton`, `CgInlineError`, `CgRetryState`, `CgNoResults`, `CgDetailList`.

- [ ] Add failing export/source contracts for semantic table roles, loading/empty/no-results/error, retry, numeric alignment and no premium imports.
- [ ] Verify RED.
- [ ] Implement semantic bounded-table primitives and a `CgDataGrid` adapter boundary without introducing MUI X yet.
- [ ] Export all primitives from `vnext/index.js`.
- [ ] Verify GREEN.

### Task 3: Canonical metrics, search and command surfaces

**Files:**
- Create: `frontend/src/components/vnext/dataChrome.js`
- Modify: `frontend/src/components/vnext/index.js`
- Test: `tests/enterprise_data_ui_issue_621.test.mjs`

**Interfaces:**
- Produces: `CgKpi`, `CgMetricGrid`, `CgStatusSummary`, `CgToolbar`, `CgCommandBar`, `CgSearchField`.

- [ ] Add failing contracts for responsive wrapping, accessible search label and command/metric exports.
- [ ] Verify RED.
- [ ] Implement minimal primitives on canonical MUI/theme.
- [ ] Verify GREEN.

### Task 4: Legacy compatibility renderer and authority ledger

**Files:**
- Create: `frontend/src/components/vnext/dataCompat.js`
- Create: `docs/architecture/enterprise-data-ui-v1.json`
- Modify: `frontend/src/components/vnext/legacyBridge.js`
- Test: `tests/enterprise_data_ui_issue_621.test.mjs`

**Interfaces:**
- Produces compatibility-safe string renderer that mirrors `CgTable` semantics for legacy pages without changing their event model.

- [ ] Add failing contracts for one canonical table authority, deprecation mapping and zero-consumer removal criteria.
- [ ] Verify RED.
- [ ] Implement the compatibility renderer and ledger.
- [ ] Verify GREEN.

### Task 5: Pilot migration — AuditPage

**Files:**
- Modify: `frontend/src/pages/AuditPage.js`
- Test: `tests/enterprise_data_ui_issue_621.test.mjs`

**Interfaces:**
- Consumes canonical compatibility renderer.
- Preserves calculations, failure-log service, actions and current row content.

- [ ] Add failing contract asserting AuditPage no longer consumes `ErpDataTable` directly.
- [ ] Verify RED.
- [ ] Replace both AuditPage table builders with canonical compatibility rendering only.
- [ ] Verify GREEN and unchanged service/action references.

### Task 6: Pilot migration — ApprovalsPage

**Files:**
- Modify: `frontend/src/pages/ApprovalsPage.js`
- Test: `tests/enterprise_data_ui_issue_621.test.mjs`

**Interfaces:**
- Preserves `ApprovalsService.inbox/mine/report/approve/reject` calls and their one-load semantics.

- [ ] Add failing contract asserting route-local `<table>` builders are removed and canonical feedback/table rendering is used.
- [ ] Verify RED.
- [ ] Migrate inbox/mine/report presentation without changing service calls or action semantics.
- [ ] Verify GREEN.

### Task 7: Preventive authority, docs and authoritative runner

**Files:**
- Create: `scripts/enterprise-data-ui-authority-audit-v621.mjs`
- Modify: `scripts/run-authoritative-contracts.mjs`
- Create: `docs/architecture/enterprise-data-ui-v1.md`
- Test: `tests/enterprise_data_ui_issue_621.test.mjs`

**Interfaces:**
- Produces fail-closed authority audit and authoritative contract inclusion.

- [ ] Add failing contract for audit/runner/docs.
- [ ] Verify RED.
- [ ] Implement audit against direct pilot table clones, direct MUI X route imports and missing ledger mappings.
- [ ] Wire authoritative runner and documentation.
- [ ] Verify GREEN.

### Task 8: Exact candidate verification and integration

- [ ] Run syntax checks on changed JS/MJS.
- [ ] Run focused #621 contract.
- [ ] Run authoritative contracts/build/browser when executable.
- [ ] Review `main...HEAD` for unrelated business/security/data changes.
- [ ] Record bundle/dependency diff and query-call-count decision.
- [ ] Create PR, merge under current owner authorization only if no scope FAIL is known; classify unavailable external provider evidence honestly.
- [ ] Close #621/remove from active backlog and refresh `main` before #622.