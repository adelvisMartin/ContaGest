# Control Hípico Editorial Race Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize Control Hípico's operational UI, remove native-browser filter popups, support fast race-context changes, and correctly expose multiple offers from one WhatsApp message without weakening financial safety gates.

**Architecture:** Keep the existing vanilla PWA and canonical `app.css`/`ui.js` authority. Add one accessible listbox primitive rendered by the PWA instead of native `<select>` for the history filters, compact the history toolbar and report navigation, and keep the race-context change as an explicit operator action while surfacing complete WhatsApp-detected race context. Extend the deterministic classifier so one source message can expose N offers while preserving the existing review/monetary gate and provider-message dedupe boundary.

**Tech Stack:** Node 22, TypeScript, vanilla ES modules, CSS, node:test, existing Playwright/QA gates.

**Spec:** `frontend/public/hipico-control/STYLE-GUIDE.md`

## Global Constraints

- `frontend/public/hipico-control/assets/css/app.css` remains the only global stylesheet.
- Reuse the existing tokens and dark/light/system theme mechanism; no versioned override stylesheet.
- Preserve `autoEligible:false` for monetary/operational WhatsApp intents.
- No provider or LLM becomes financial authority.
- Touch targets remain at least 44 px on coarse/mobile surfaces; desktop controls remain visually compact.
- SOURCE/LAB and existing outbox/idempotency/compliance contracts remain unchanged.

## Review Focus

- Multiple offers separated by newlines or semicolons must remain distinct and retain role/play/horse/amount.
- A complete race opening may be surfaced for fast application, but incomplete/ambiguous openings must not silently mutate active race state.
- Listbox keyboard behavior must support Arrow keys, Home/End, Enter/Space, Escape and return focus.
- History date/filter controls must stay single-line on desktop and responsive at 360–430 px.
- Dark theme must stay neutral graphite rather than green-cast while preserving readable primary-action contrast.

---

### Task 1: Regression contracts for the approved redesign

**Files:**
- Create: `tests/hipico_editorial_race_control_v611.test.mjs`
- Modify: `backend/src/modules/hipico-bot/hipico-operational-classifier.test.ts`

**Interfaces:**
- Consumes: canonical CSS/JS and `classify(text)`.
- Produces: failing tests that pin custom listbox markup, compact history/report UI, quick race edit affordance, neutral dark tokens, and multi-offer classification.

- [ ] Write failing static/UI contract tests.
- [ ] Add failing classifier test for 2–3 offers in a single source message.
- [ ] Run authoritative CI on the test-only SHA and record expected RED failures.

### Task 2: Accessible custom listbox + compact Editorial Race Control UI

**Files:**
- Modify: `frontend/public/hipico-control/assets/js/ui.js`
- Modify: `frontend/public/hipico-control/assets/js/app.js`
- Modify: `frontend/public/hipico-control/assets/css/app.css`

**Interfaces:**
- Consumes: history filter state, existing `escapeHtml`, theme tokens, event delegation.
- Produces: `ui.listbox(...)` markup plus delegated listbox behavior, compact date/filter toolbar, modern report command bar, and neutral graphite dark tokens.

- [ ] Implement the minimal listbox primitive/behavior needed by the failing tests.
- [ ] Replace native history `<select>` controls with the listbox primitive while keeping form state semantics.
- [ ] Compact date/filter geometry and modernize the report command bar.
- [ ] Update explicit/system dark tokens to neutral graphite values and preserve brand contrast.

### Task 3: Fast race-context edit and deterministic multi-offer parsing

**Files:**
- Modify: `frontend/public/hipico-control/assets/js/app.js`
- Modify: `backend/src/modules/hipico-bot/hipico-operational-classifier.ts`

**Interfaces:**
- Consumes: active race/workspace state, existing modal/action delegation, `OperationalEntities.offers`.
- Produces: explicit quick race edit affordance in the active-race header and N parsed offers for one WhatsApp message without auto-execution.

- [ ] Expose quick edit for active race context using the existing modal/save path rather than a second persistence route.
- [ ] Segment a player/receiver source message into multiple offer clauses and populate `entities.offers` deterministically.
- [ ] Keep top-level role/play/horse/amount compatible with the first parsed offer and keep `autoEligible:false`.

### Task 4: Verification and merge

**Files:**
- No new production owner.

**Interfaces:**
- Consumes: exact candidate SHA from Tasks 1–3.
- Produces: CI evidence and merged `main` only if required checks are green.

- [ ] Run/inspect classifier tests, UI contract tests, lint/typecheck/build and Hípico browser/visual gates available to the PR.
- [ ] Review final diff for scope, secrets, unsafe transport changes and accidental stylesheet authority.
- [ ] Merge the PR at the exact verified head SHA.
