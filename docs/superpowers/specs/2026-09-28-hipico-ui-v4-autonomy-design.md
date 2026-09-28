# Control Hípico — UI System v4 + Race Context + Multi-bet + WhatsApp Autonomy

Date: 2026-09-28
Baseline: `main@d4c1e360e1348f4ebfe5a998ea487dbb972a4966`
Branch: `feat/hipico-ui-v4-autonomy`

## 1. Objective

Finish the Control Hípico work as one integrated change instead of isolated cosmetic patches. The result must:

- replace inconsistent/native-looking controls with one visual system aligned to the existing Style Guide;
- reduce visual density in history filters and date controls;
- unify light/dark theming and remove the current green/dirty-gray bias from dark mode;
- remove the desktop legacy toolbar duplication and keep only the correct navigation per breakpoint;
- make active race context fast to change manually and safe to update from WhatsApp race-opening messages;
- parse 2–3 or more independent bets/offers contained in one WhatsApp message consistently in backend and local bridge;
- preserve current contracts, access controls, persistence, idempotency, source pinning, outbox/reconciliation, PWA/offline behavior and existing automated operations;
- verify the exact implementation SHA with focused tests and existing repository gates before merge.

## 2. Current-state findings

### Frontend

`frontend/public/hipico-control/assets/css/app.css` already contains canonical v3 tokens, custom listbox styling, compact filter rules and dark-theme variables. However, the visual result is still inconsistent because:

1. not every visible `<select>` is guaranteed to be enhanced by the custom listbox flow;
2. native select styling still exists for some secondary/ops surfaces;
3. the history filter grid remains too tall/heavy relative to its role;
4. date fields still inherit generic form geometry that is better suited to modal forms than compact dashboard filtering;
5. some navigation/action rows duplicate information that already exists in the desktop sidebar;
6. dark mode uses a palette that is technically neutralized compared with older versions but still does not meet the requested visual character and contrast hierarchy.

`frontend/public/hipico-control/assets/js/ui.js` already contains a custom select enhancer and a quick race-change affordance. This work must consolidate those features instead of introducing a parallel component system.

### WhatsApp / race context

`backend/src/modules/hipico-bot/hipico-operational-classifier.ts` already extracts race openings (`racetrack`, `raceNumber`, `raceContextComplete`) but currently returns them as review-gated evidence and does not mutate active race context automatically.

The same backend classifier already contains multi-offer segmentation support through `splitOfferLine()` / `parseOffers()`. The local WhatsApp Web bridge runtime parser still has an older path that splits by new line and can diverge from backend behavior. That divergence must be removed.

The bridge already has durable spool/journal behavior, source pinning, source auto-reply kill switch, backend readiness checks and duplicate-delivery protections. These remain the safety base; this change does not bypass them.

## 3. Design direction

### 3.1 Visual language

Use an "Editorial Race Control" visual direction:

- information-dense but calm;
- neutral surfaces first, burgundy only for selection/focus/primary action;
- borders and spacing before shadows;
- compact controls in desktop, 44px touch targets on coarse/mobile input;
- identical geometry between light and dark themes;
- no neon/casino styling;
- no new override stylesheet; `app.css` remains the single canonical style authority.

### 3.2 Theme tokens

Refine the canonical tokens rather than create a second theme layer.

Light theme:
- warm-neutral page background;
- white/near-white surfaces;
- charcoal text;
- soft neutral borders;
- restrained burgundy accent.

Dark theme:
- graphite page background;
- stepped charcoal surfaces;
- high-contrast neutral text;
- no green-tinted base surfaces;
- burgundy/pink accent used only for interactive emphasis;
- semantic success/warning/danger colors kept separate from the base palette.

All text/background combinations must keep WCAG AA contrast for normal text where applicable.

## 4. Component changes

### 4.1 Select / Listbox

Create one authoritative select enhancement path in `ui.js` and apply it to all Control Hípico selects that participate in the app shell and operational views.

Requirements:
- native `<select>` remains the form/state contract but is visually hidden after enhancement;
- custom trigger mirrors current value and disabled state;
- custom listbox owns popup visuals;
- keyboard support: Enter/Space, Escape, ArrowUp/ArrowDown, Home/End, typeahead;
- selected option state and focus state are distinct;
- outside click closes the listbox;
- popup can flip upward when viewport space is insufficient;
- list remains scrollable with many participants/thirds;
- change events must continue to reach existing listeners exactly as before;
- enhancement must be idempotent across rerenders;
- modal/ops selects must use the same component or a deliberate native fallback only when the control is browser-owned and visually hidden from normal product UI.

### 4.2 History filters

Desktop target:
- compact horizontal toolbar/grid;
- closed controls around 36–40px visual height;
- date copy on one line (`28 sep 2026` style);
- labels reduced in visual weight;
- `Aplicar` same height as neighboring controls;
- no multi-line date tile presentation;
- quick period action such as `Esta semana` remains secondary.

Tablet/mobile:
- stack responsively;
- retain 44px minimum touch target;
- no horizontal clipping;
- no oversized primary button.

### 4.3 Dates

The closed date field becomes a compact single-line control with icon + formatted date. The open calendar remains richer and may use more vertical space. Generic form-date presentation must not leak into the history toolbar.

### 4.4 Navigation/actions

Desktop:
- sidebar remains the primary section navigation;
- legacy `more-dashboard` duplicated navigation stays hidden;
- page-level actions remain near the page heading;
- session/theme actions must not appear as a 2000-era segmented toolbar.

Mobile:
- bottom/mobile navigation remains the primary navigation;
- any overflow actions use the same button primitives and tokens;
- no duplicate desktop sidebar semantics.

### 4.5 Race context control

The active race header must expose a compact `Cambiar carrera` action whenever race context is relevant.

Manual flow:
1. user opens race change;
2. selects/enters racetrack and race number;
3. existing race state/store contracts are used;
4. successful change refreshes the visible active context immediately.

WhatsApp-assisted flow:
1. inbound message is classified;
2. a complete race-opening context yields racetrack + race number + confidence;
3. runtime compares it with current active race;
4. if context is complete and policy permits, create/promote the race context through the existing authority layer;
5. if incomplete, conflicting or unsafe, keep it pending/review and do not mutate money/ledger;
6. UI reflects the new active context without requiring a page reload.

No free-form LLM output is authoritative for race mutation. LLM/agent assistance may only enrich ambiguous interpretation; deterministic validation remains the gate.

## 5. Multi-bet parsing

Use one segmentation contract for backend and local bridge.

Input examples that must be supported:

- `JUEGA 2P al 4 con 100, 3P al 7 con 150 y 5N al 8 con 80`
- `JUEGO 2P 4 con 100; JUEGO 3P 7 con 200`
- mixed `JUEGA` / `CONSIGUE` clauses where syntax is independently valid.

Rules:
- segment by explicit offer verbs first;
- when only one verb prefixes multiple clauses, split only at separators that are followed by a valid play/horse pattern;
- preserve the original raw fragment for auditability;
- each parsed offer gets its own role/play/horse/amount/party fields;
- invalid fragments do not silently contaminate valid fragments;
- message-level processing returns all valid offers plus review evidence for ambiguous remainder;
- downstream idempotency derives from the original source message identity plus deterministic offer index/fragment identity so replay cannot duplicate monetary effects.

The local bridge must use the same segmentation semantics as the backend classifier. Duplicated parser logic may remain only if covered by contract tests that assert equivalence; preferred direction is extraction into a shared source module that both call.

## 6. Autonomy and WhatsApp safety

The target is autonomous operation with human intervention as fallback, not bypass of safety gates.

Keep and verify:
- source group ID pinning;
- backend readiness check before source send;
- source auto-reply feature flag and kill switch;
- durable spool;
- immutable source-reply command;
- monotonic delivery reconciliation;
- no automatic resend after ambiguous delivery;
- duplicate visible-message detection;
- rate/backoff handling;
- dead-letter/quarantine behavior;
- source/lab isolation.

No implementation can guarantee that WhatsApp will never restrict or close an account. The engineering objective is to reduce operational risk and prevent system corruption if the channel disconnects, changes DOM, rate-limits, or becomes unavailable.

Control Hípico must remain functional as a system of record even if WhatsApp transport is unavailable.

## 7. Files expected to change

Primary:
- `frontend/public/hipico-control/assets/css/app.css`
- `frontend/public/hipico-control/assets/js/ui.js`
- `frontend/public/hipico-control/assets/js/app.js` and/or the specific page/render modules that own history/race context if required
- `frontend/public/hipico-control/sw.js`
- `backend/src/modules/hipico-bot/hipico-operational-classifier.ts`
- `scripts/hipico-whatsapp-bridge/runtime-utils.mjs`
- bridge/runtime source only where required to consume the shared parsing/race-context contract

Tests expected:
- frontend contract/unit/browser tests covering select enhancement, history filter geometry, race change and light/dark behavior;
- backend classifier tests for multi-offer messages and race opening;
- local bridge parser/runtime tests asserting parity with backend behavior;
- existing autonomous source-reply/idempotency tests retained;
- existing Playwright/visual/accessibility gates where repository configuration supports them.

Exact paths may narrow after implementation exploration; unrelated files are out of scope.

## 8. Error handling and rollback

- Failed select enhancement: native select remains in DOM and state must remain recoverable; no data loss.
- Failed race promotion: keep existing active race unchanged and surface a review/pending state.
- Ambiguous multi-bet fragment: do not guess a monetary operation; return review evidence.
- WhatsApp transport failure: spool/retry according to existing policy; never duplicate source reply or financial effect.
- PWA cache: bump shell cache revision whenever canonical static assets change so GitHub Pages clients receive the new UI.

Rollback is a normal git revert of this change; no destructive migration is planned for the UI portion. Any persistence change discovered during implementation must be separately justified and use additive/reversible migration strategy.

## 9. Validation plan

Minimum verification before merge:

1. diff review against baseline SHA;
2. lint/typecheck for touched packages;
3. focused unit/contract tests for UI/select/race/multi-bet;
4. backend classifier tests;
5. bridge/runtime parser tests;
6. build(s) relevant to touched frontend/backend packages;
7. browser validation at representative widths: 360, 390/430, 768, 1366/1440, 1920 where available;
8. light/dark, keyboard, focus, loading/empty/error/success/disabled, responsive, reduced-motion checks for affected UI;
9. exact-SHA GitHub Actions review;
10. GitHub Pages deployment status after merge;
11. PWA cache version verified on final SHA.

Do not mark a gate PASS unless executed or evidenced by the exact candidate SHA.

## 10. Acceptance criteria

The work is complete only when all of the following are true:

- opening product selects no longer exposes an unstyled browser popup on normal Control Hípico surfaces;
- history date controls are single-line and visually compact when closed;
- filter controls and Apply button have consistent compact height on desktop and correct touch size on mobile;
- duplicated legacy navigation/action toolbar is absent on desktop;
- light/dark themes have consistent neutral hierarchy and requested graphite dark appearance;
- active race can be changed quickly from the race context UI;
- a complete race-opening WhatsApp message can safely become/propose the active race according to policy without touching balances/ledger incorrectly;
- one WhatsApp message containing 2–3 valid bets yields 2–3 deterministic independent offers consistently in backend and bridge;
- replay/reconnect cannot create duplicate financial effects;
- existing auth/access/source pinning/outbox/reconciliation behavior is preserved;
- PWA cache invalidation prevents stale UI after deployment;
- candidate diff has no secrets, dead code, debug-only bypasses, skipped tests or artificial CI green hacks.

## 11. Out of scope

- rewriting Control Hípico into React/MUI or another framework;
- replacing PostgreSQL/Supabase architecture;
- bypassing WhatsApp platform controls or anti-abuse systems;
- making an LLM the financial authority;
- unrelated ContaGest refactors outside touched dependency paths.
