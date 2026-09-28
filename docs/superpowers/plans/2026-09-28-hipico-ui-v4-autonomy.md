# Control Hípico UI v4 + Autonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Control Hípico visual redesign and make race-context / multi-bet WhatsApp behavior consistent and safe across frontend, backend classifier, and local bridge.

**Architecture:** Keep the existing static Control Hípico frontend and its canonical `app.css` / `ui.js` primitives, consolidating rather than introducing a second component system. Preserve the current backend/bridge authority boundaries, outbox, idempotency, source pinning and kill-switch behavior; only deterministic, validated race context and segmented offers may flow through existing policy gates.

**Tech Stack:** HTML/CSS/ES modules, Node.js/TypeScript, Playwright, Node test runner, PostgreSQL/Prisma, GitHub Pages PWA/service worker.

**Spec:** `docs/superpowers/specs/2026-09-28-hipico-ui-v4-autonomy-design.md`

## Global Constraints

- No React/MUI rewrite and no new heavy UI framework.
- `frontend/public/hipico-control/assets/css/app.css` remains the single canonical style authority; do not add an override stylesheet.
- Keep PostgreSQL/Supabase persistence architecture unchanged unless an additive reversible persistence change is proven necessary.
- Do not bypass WhatsApp anti-abuse/platform controls, source pinning, kill switch, readiness checks, outbox, reconciliation, or rate/backoff behavior.
- No LLM output is authoritative for money, race mutation, or settlement.
- Desktop controls are compact; touch/coarse-pointer controls retain a 44px minimum target.
- Light and dark themes share geometry; dark theme uses graphite/charcoal neutral surfaces rather than green-tinted base surfaces.
- Exact-SHA verification is required before merge; no skipped tests or artificial CI-green changes.

## Review Focus

- A select rerenders after state change: enhancer remains idempotent and the selected value/change event contract is preserved.
- A long option list opens near the viewport bottom: popup flips upward, remains scrollable and keyboard navigable.
- One WhatsApp message contains valid offers plus an ambiguous fragment: valid offers stay independent and the ambiguous fragment never becomes a guessed monetary effect.
- A race-opening message conflicts with the current race or lacks track/number: active race remains unchanged and evidence stays pending/review.
- A transport send becomes ambiguous during reconnect/restart: no automatic resend or duplicate financial/source effect occurs.

---

### Task 1: Lock UI v4 component contracts with regression tests

**Files:**
- Modify/Create focused tests under the existing Control Hípico frontend test locations discovered in-repo.
- Read/target: `frontend/public/hipico-control/assets/js/ui.js`
- Read/target: `frontend/public/hipico-control/assets/css/app.css`

**Interfaces:**
- Consumes: existing select enhancer, date/filter classes, navigation primitives and theme tokens.
- Produces: regression contracts for all visible app selects, compact date/filter geometry, desktop legacy-toolbar suppression, theme token expectations and keyboard/focus behavior.

- [ ] Write failing tests asserting all normal product selects are enhanced into the canonical listbox, rerender enhancement is idempotent, native popup is not the visible UI, and change events still reach existing listeners.
- [ ] Run only those focused tests and record the expected failures against the current branch.
- [ ] Add failing assertions for compact history dates/filters, desktop toolbar suppression, mobile touch targets, graphite dark surfaces and consistent light/dark geometry.
- [ ] Run the focused test group again and confirm failures are attributable to the missing v4 behavior.
- [ ] Commit the red tests.

### Task 2: Consolidate select/listbox enhancement and compact filter/date UI

**Files:**
- Modify: `frontend/public/hipico-control/assets/js/ui.js`
- Modify: `frontend/public/hipico-control/assets/css/app.css`
- Modify page/render module only if a specific select/date control bypasses canonical primitives.

**Interfaces:**
- Consumes: current native `<select>` values/listeners and current render loop.
- Produces: one idempotent `enhanceSelects(root)` path for all product selects, custom trigger/listbox DOM, and compact history date/filter presentation.

- [ ] Expand/select the canonical enhancement selector so every visible product select is enhanced while preserving hidden/native contract state.
- [ ] Preserve Enter/Space, Escape, ArrowUp/ArrowDown, Home/End, typeahead, outside-click, disabled and selected states, upward flipping and focus restoration.
- [ ] Refine listbox trigger/menu/option CSS to the approved design tokens and remove visual dependence on browser popup styling.
- [ ] Refine history filter/date CSS so closed controls are single-line, compact, aligned, and `Aplicar` matches sibling height; retain 44px touch targets at mobile/coarse breakpoints.
- [ ] Run Task 1 focused tests until green.
- [ ] Commit the component/filter implementation.

### Task 3: Rework theme and navigation/action hierarchy

**Files:**
- Modify: `frontend/public/hipico-control/assets/css/app.css`
- Modify frontend render/navigation module only where legacy action rows are emitted incorrectly.

**Interfaces:**
- Consumes: existing light/dark theme attributes and sidebar/mobile navigation contracts.
- Produces: warm-neutral light palette, graphite dark palette, canonical sidebar desktop navigation and modern action styling without duplicated legacy toolbar.

- [ ] Add/extend regression tests for the approved light/dark token hierarchy, contrast-relevant states, desktop `more-dashboard` suppression and mobile-only overflow/navigation behavior.
- [ ] Run tests and confirm the current palette/action hierarchy fails the new contracts where expected.
- [ ] Refine canonical tokens and surfaces in `app.css`; semantic success/warning/danger colors remain semantically distinct from neutral base surfaces.
- [ ] Keep `more-dashboard` hidden on desktop and style any mobile/overflow use through canonical button primitives rather than segmented legacy controls.
- [ ] Verify hover/focus/disabled/active states and reduced-motion behavior.
- [ ] Run the focused UI tests until green and commit.

### Task 4: Make race context quick-change explicit and policy-safe

**Files:**
- Modify: `frontend/public/hipico-control/assets/js/ui.js`
- Modify relevant Control Hípico race render/state module discovered in-repo.
- Modify backend race-context policy/authority module only if current classifier output is not yet consumed through the existing authority layer.
- Test: existing race-context/classifier/runtime tests plus new focused regressions.

**Interfaces:**
- Consumes: `classify()` race opening entities `{ racetrack, raceNumber, raceContextComplete }`, existing `new-race`/race-store contract and current policy gate.
- Produces: visible quick-change action and a deterministic candidate/promotion flow that never mutates balances/ledger merely because a race-opening message was observed.

- [ ] Write failing tests for manual quick change, complete race-opening context, incomplete context, conflicting context and repeated identical opening messages.
- [ ] Run the focused tests and capture current failures.
- [ ] Ensure `Cambiar carrera` is rendered only in relevant race context and uses existing state/store contracts.
- [ ] Route complete WhatsApp race-opening evidence into the existing policy/authority layer; auto-promote only when current policy explicitly permits, otherwise retain pending/review evidence.
- [ ] Ensure incomplete/conflicting evidence leaves the active race unchanged.
- [ ] Run focused race tests until green and commit.

### Task 5: Unify multi-bet segmentation between backend and bridge

**Files:**
- Modify: `backend/src/modules/hipico-bot/hipico-operational-classifier.ts`
- Modify: `scripts/hipico-whatsapp-bridge/runtime-utils.mjs`
- Modify/create shared parser helper only if it reduces duplicate logic without breaking module boundaries.
- Modify focused classifier/bridge tests.

**Interfaces:**
- Consumes: source message text and existing offer shape `{ role, play, horse, amount, participant?, counterparty?, raw }`.
- Produces: deterministic `offers[]` with one item per valid clause and equivalent segmentation semantics in backend and bridge.

- [ ] Add failing backend and bridge parity tests for: one verb + three clauses, repeated verbs, mixed JUEGA/CONSIGUE, newline-separated offers, ambiguous remainder and replay-stable ordering.
- [ ] Run focused tests and verify the bridge currently diverges from backend for same-line multi-offer input.
- [ ] Extract or mirror the backend `splitOfferLine` semantics into the bridge so both paths segment by explicit verbs first, then safe separators followed by a valid play/horse pattern.
- [ ] Preserve raw fragment text and deterministic order/index for downstream idempotency.
- [ ] Ensure invalid fragments do not contaminate valid offers and are never silently converted into monetary actions.
- [ ] Run parity tests until green and commit.

### Task 6: Reverify autonomous WhatsApp safety invariants

**Files:**
- Test/inspect: `scripts/hipico-whatsapp-bridge/runtime.mjs`
- Test/inspect: backend source-reply/outbox/reconciliation modules and their existing tests.

**Interfaces:**
- Consumes: parsed/classified inbound event and existing source-reply command/outbox.
- Produces: unchanged safety invariants after race/multi-bet changes.

- [ ] Run existing source pinning, kill-switch, readiness, source-reply idempotency, ambiguous-delivery, spool/backoff and reconciliation tests.
- [ ] Add a regression test only where Task 4/5 introduces an uncovered integration path (race opening or multi-offer replay).
- [ ] Verify no source-send bypass was introduced and no ambiguous delivery can auto-resend.
- [ ] Commit any necessary regression-only changes.

### Task 7: Invalidate PWA shell and run full proportional verification

**Files:**
- Modify: `frontend/public/hipico-control/sw.js`
- Inspect package scripts/workflows and existing Control Hípico QA gates.

**Interfaces:**
- Consumes: final static asset set.
- Produces: a new shell-cache revision and exact candidate SHA ready for PR/merge.

- [ ] Bump the shell-cache revision after final static asset changes.
- [ ] Run repository-recommended install/lint/typecheck/focused tests/build commands for touched packages; use `pnpm install --frozen-lockfile` where the repository workflow requires install.
- [ ] Run relevant Playwright/browser checks at representative widths and both themes where local/CI configuration supports them; include keyboard/focus/responsive checks.
- [ ] Review the final diff against `main@d4c1e360e1348f4ebfe5a998ea487dbb972a4966` for secrets, dead code, overrides, mocks, skips and unrelated scope.
- [ ] Commit final cache/version change.

### Task 8: PR, exact-SHA CI review, merge and deployment verification

**Files:** none unless CI exposes a defect in the candidate.

**Interfaces:**
- Consumes: final branch candidate SHA.
- Produces: merged `main` SHA with published evidence/status.

- [ ] Open a PR from `feat/hipico-ui-v4-autonomy` to `main` documenting baseline, candidate, changed flows and executed verification.
- [ ] Confirm each workflow/run inspected belongs to the exact candidate SHA; for any failure, read that run's job/step/log evidence and fix the root cause without skipping/disabling gates.
- [ ] Repeat verification for every new candidate SHA created by a fix.
- [ ] Merge only after the candidate evidence is acceptable under the repository's actual protection/configuration; report any external GitHub/Vercel/provider blockage separately from code quality.
- [ ] Verify the final `main` SHA, GitHub Pages deployment and PWA cache revision. Do not claim deployment PASS until the matching deployment run succeeds.
