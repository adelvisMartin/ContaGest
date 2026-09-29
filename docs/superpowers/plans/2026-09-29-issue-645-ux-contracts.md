# Theme, State & Accessibility Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make theme resolution, UI states, focus/keyboard/error semantics and reduced-motion requirements explicit, reusable and testable for ContaGest components and browser QA.

**Architecture:** `frontend/src/design-system/uxContract.v1.js` is the single executable requirements authority. Runtime adapters (`app.js`, `muiRuntime.js`, Store normalization and vNext components) consume that authority; browser/contract tests read the same contract instead of redefining requirements. A dependency-free browser pilot proves the deterministic subset locally with Chromium and semantic tokens.

**Tech Stack:** JavaScript/ESM, React/MUI, Node test runner, Chromium headless, ContaGest semantic tokens.

**Spec:** GitHub issue #645.

## Global Constraints

- Preserve existing API, persistence, tenant, auth/RBAC and accounting behavior.
- Keep `light | dark | system` as the only persisted theme preferences.
- Semantic colors stay owned by #631; no parallel palette/theme provider.
- `NOT_APPLICABLE` must be explicit with a reason; omission is not equivalent.
- Browser helpers must not use sleeps, force or skipped assertions to fabricate PASS.

## Review Focus

- `system` theme must resolve identically in DOM runtime and MUI runtime.
- error/helper text must be referenced by the input that owns the error.
- overlays retain MUI focus trap/restore and Escape semantics unless saving explicitly blocks close.
- reduced-motion must collapse non-essential animation without hiding state changes.
- zoom/reflow and focus-visible checks must remain deterministic at mobile widths.

---

### Task 1: Canonical UX contract and theme authority

**Files:**
- Create: `frontend/src/design-system/uxContract.v1.js`
- Modify: `frontend/src/app.js`
- Modify: `frontend/src/state/store.js`
- Modify: `frontend/src/components/muiRuntime.js`
- Test: `tests/theme_state_accessibility_issue_645.test.mjs`

**Interfaces:**
- Produces `UX_CONTRACT_V1`, `normalizeThemePreference(value)`, `resolveThemeMode(preference, systemDark)`, `SYSTEM_THEME_QUERY`, `requiredUiStates(kind)`.

- [ ] Write contract tests for the state catalog, failure codes, theme normalization and mode resolution.
- [ ] Verify the tests fail before the authority exists.
- [ ] Implement the contract module and wire app/Store/MUI adapters to it.
- [ ] Verify focused tests pass.

### Task 2: Component semantics and coherent state primitives

**Files:**
- Create: `frontend/src/components/vnext/states.js`
- Modify: `frontend/src/components/vnext/index.js`
- Modify: `frontend/src/components/vnext/forms.js`
- Modify: `frontend/src/components/vnext/data.js`
- Modify: `frontend/src/components/vnext/overlays.js`
- Test: `tests/theme_state_accessibility_issue_645.test.mjs`

**Interfaces:**
- Produces canonical `CgUiState` plus loading/empty/no-results/success/warning/error/permission/offline/saving adapters.

- [ ] Add tests that state exports map to the canonical contract and that autocomplete error/helper associations are not dangling.
- [ ] Implement the state primitive and delegate applicable data states to it.
- [ ] Harden dialog labeling and form error association without changing business behavior.
- [ ] Verify focused tests pass.

### Task 3: Focus/reduced-motion theme hardening

**Files:**
- Modify: `frontend/src/components/muiThemeAdapter.js`
- Test: `tests/theme_state_accessibility_issue_645.test.mjs`

- [ ] Add source contracts for visible focus and reduced-motion overrides derived from semantic tokens.
- [ ] Add theme overrides for focus-visible controls and reduced motion.
- [ ] Verify the focused contract passes.

### Task 4: Real browser pilot and documentation

**Files:**
- Create: `frontend/public/ux-contract-v645.html`
- Create: `scripts/ux-contract-browser-v645.mjs`
- Create: `docs/architecture/ux-theme-state-accessibility-contract-v1.md`
- Modify: `scripts/run-authoritative-contracts.mjs`
- Test: `tests/theme_state_accessibility_issue_645.test.mjs`

- [ ] Build a dependency-free pilot that consumes semantic tokens and the canonical contract.
- [ ] Validate light/dark/system resolution, states, focus, Escape recovery, reduced motion, contrast and 200% zoom/no-overflow in local Chromium.
- [ ] Wire the focused contract into the authoritative runner and document do/don't plus `NOT_APPLICABLE` policy.
- [ ] Run exact-candidate focused Node tests and Chromium pilot before PR/merge; classify external CI independently.
