# #620 Forms & Interaction Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one canonical ContaGest forms/interaction layer and migrate real MUI islands to it without changing business/API contracts.

**Architecture:** Extend the #619 `Cg*` library with focused form/interaction modules. Keep `index.js` as the public barrel, preserve legacy hidden inputs as migration synchronization targets, and add fail-closed source contracts/audits plus a migration ledger.

**Tech Stack:** React 19, MUI 9, Node 22 `node:test`, existing semantic tokens/theme.

**Spec:** `docs/superpowers/specs/2026-09-29-issue-620-forms-interaction-library-design.md`

## Global Constraints

- No new form/date/UI framework dependency.
- No business, RBAC, tenant, accounting, API or persistence changes.
- Decimal/money inputs remain strings; do not use `Number` as authority.
- Canonical dates are `YYYY-MM-DD`; canonical times are `HH:mm`.
- Legacy compatibility is transitional and must remain explicitly mapped.
- No local clone of select/dialog/date/filter primitives when canonical equivalents exist.

## Review Focus

- Empty/null/absent form values preserve caller intent instead of collapsing silently.
- Backend 403/404/409/422/429/5xx envelopes preserve safe field/code/correlation metadata.
- Select/autocomplete option values preserve string IDs and do not coerce numeric-looking IDs.
- Overlay close behavior restores focus and does not permit accidental irreversible action.
- Date/time values do not drift through timezone conversion.

---

### Task 1: Contract and pure form adapters

**Files:**
- Create: `tests/forms_interaction_issue_620.test.mjs`
- Create: `frontend/src/components/vnext/formContracts.js`

**Interfaces:**
- Produces: `normalizeUiError(error)`, `normalizeOptionalFormValue(value,{emptyAs})`, `normalizeDateValue(value)`, `normalizeTimeValue(value)`, `serializeDateRange(range)`.

- [ ] Write the failing source/pure-helper contract covering safe backend error fields, string IDs, null/empty policy, date/time formats and no Decimal coercion.
- [ ] Run the focused contract and verify RED because `formContracts.js` does not exist.
- [ ] Implement only the five helpers above.
- [ ] Run the focused contract and verify GREEN.

### Task 2: Canonical input and selection primitives

**Files:**
- Create: `frontend/src/components/vnext/forms.js`
- Modify: `frontend/src/components/vnext/index.js`
- Test: `tests/forms_interaction_issue_620.test.mjs`

**Interfaces:**
- Consumes Task 1 helpers.
- Produces: `CgFormField`, `CgSelect`, `CgAutocomplete`, `CgCombobox`, `CgCheckbox`, `CgRadioGroup`, `CgSwitch`, `CgDatePicker`, `CgDateRange`, `CgTimeField`.

- [ ] Extend the failing contract with required exports, semantic states, accessible label/helper/error contracts, explicit option values and no MUI-X dependency.
- [ ] Verify RED.
- [ ] Implement focused canonical form/select/date components using existing MUI primitives and string-valued date/time inputs.
- [ ] Export them from `vnext/index.js`.
- [ ] Verify focused contract GREEN.

### Task 3: Canonical overlays and filters

**Files:**
- Create: `frontend/src/components/vnext/overlays.js`
- Create: `frontend/src/components/vnext/filters.js`
- Modify: `frontend/src/components/vnext/index.js`
- Test: `tests/forms_interaction_issue_620.test.mjs`

**Interfaces:**
- Produces: `CgDialog`, `CgConfirmDialog`, `CgDrawer`, `CgPopover`, `CgMenu`, `CgFilterBar`, `CgFilterChip`.

- [ ] Add failing contract for one overlay owner, Escape/focus-restoration defaults, saving/disabled destructive actions, and compact responsive filters.
- [ ] Verify RED.
- [ ] Implement overlay/filter primitives with MUI defaults and semantic props only.
- [ ] Export them from the barrel.
- [ ] Verify GREEN.

### Task 4: Real migration pilots

**Files:**
- Modify: `frontend/src/components/muiRuntime.js`
- Modify: `frontend/src/components/vnext/legacyBridge.js`
- Create: `docs/architecture/forms-interaction-v1.json`
- Test: `tests/forms_interaction_issue_620.test.mjs`

**Interfaces:**
- Consumes `CgSelect`, date/time primitives and Task 1 helpers.
- Produces: select/date pilot delegation while preserving hidden/native synchronization.

- [ ] Add failing contract asserting `SelectIsland` uses `CgSelect`, date/time native islands delegate to canonical interaction primitives, and legacy mapping/deprecation exists.
- [ ] Verify RED.
- [ ] Migrate `SelectIsland` and date/time handling without changing hidden fallback submitted values or reset behavior.
- [ ] Extend bridge/ledger with transitional owners and zero-consumer removal criteria.
- [ ] Verify GREEN.

### Task 5: Preventive authority and integration

**Files:**
- Create: `scripts/forms-interaction-authority-audit-v620.mjs`
- Modify: `scripts/run-authoritative-contracts.mjs`
- Create: `docs/architecture/forms-interaction-v1.md`
- Test: `tests/forms_interaction_issue_620.test.mjs`

**Interfaces:**
- Produces: fail-closed audit and authoritative contract inclusion.

- [ ] Add failing contract asserting audit presence/result and authoritative runner inclusion.
- [ ] Verify RED.
- [ ] Implement audit for exports, pilot delegation, migration ledger and duplicate local authority patterns.
- [ ] Add #620 contract to authoritative runner and documentation/do-don't.
- [ ] Verify focused contract GREEN.

### Task 6: Exact-candidate verification and integration decision

**Files:** no planned production changes unless verification exposes a scoped defect.

- [ ] Run `node --check` on changed JS/MJS.
- [ ] Run `node --test tests/forms_interaction_issue_620.test.mjs`.
- [ ] Run relevant authority/contracts and frontend build where executable.
- [ ] Run Chromium pilot QA where executable; classify unavailable infrastructure honestly.
- [ ] Review `main...HEAD` diff for unrelated business/security/data changes.
- [ ] Create PR against current `main`.
- [ ] Merge/close/remove #620 only if material acceptance criteria have real evidence; otherwise leave PR open and record the blocking evidence.
