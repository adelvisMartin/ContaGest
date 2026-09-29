# #620 Forms & Interaction Library — Design

**Issue:** #620  
**Baseline:** `main@865fcc88a4d877b68466a64cef1a0a56370fb5fc`  
**Depends on:** #619 Component Library vNext and #631 Single Design Token Authority.

## Intent

Establish one canonical interaction/form layer for ContaGest so migrated React/MUI surfaces stop depending on browser-native styling or route-local overlay behavior. Preserve current backend contracts, permissions, tenant boundaries, accounting rules, serialization semantics, and legacy routes while adding reusable primitives with explicit controlled-value, accessibility, focus, and async-state contracts.

## Architecture

`frontend/src/components/vnext/index.js` remains the public barrel/authority. Complex interaction primitives live in focused modules under `frontend/src/components/vnext/` and reuse the canonical MUI theme/tokens from #631 and the foundation primitives from #619. Existing `muiRuntime.js` becomes a compatibility consumer: legacy `<select>`/input islands delegate rendering to canonical `Cg*` controls while native elements remain hidden synchronization targets during migration.

No second theme/provider, form framework, date framework, or overlay authority is introduced.

## Components

The canonical interaction layer provides:

- `CgFormField` for label/helper/error semantics and stable IDs;
- `CgSelect` with MUI listbox/menu behavior, controlled `value`, explicit options, loading/empty/error states and compact menu geometry;
- `CgAutocomplete` and `CgCombobox` using MUI Autocomplete with accessible labels and explicit option/value mapping;
- `CgCheckbox`, `CgRadioGroup`, `CgSwitch`;
- `CgDatePicker`, `CgDateRange`, `CgTimeField` using native date/time value formats through canonical styled text fields instead of adding MUI X/date dependencies;
- `CgDialog`, `CgConfirmDialog`, `CgDrawer`, `CgPopover`, `CgMenu` using one overlay contract with Escape/focus restoration delegated to MUI defaults and irreversible actions opting out explicitly;
- `CgFilterBar` and `CgFilterChip` for compact responsive filtering;
- `normalizeUiError()` to preserve safe backend `code`, `field`, `correlationId`, HTTP status and message without converting all failures into generic text;
- `normalizeOptionalFormValue()` and canonical date-range serialization helpers that distinguish absent/null/empty input intentionally.

## State contracts

Form components accept explicit `disabled`, `readOnly`, `loading` or `saving` states where applicable. Submit actions must be disabled while saving to prevent double submit, but recoverable errors remain visible and retryable. Controlled components require `value` plus `onChange`; optional uncontrolled `defaultValue` is supported only where MUI itself has an unambiguous contract. Components must not maintain a second hidden source of truth beyond the migration adapter.

## Error and data flow

Backend errors are adapted, not discarded. `normalizeUiError()` maps safe fields from status/response/envelope into `{ message, code, field, correlationId, status, scope }`, with scope `field | form | global`. Permission UI is presentation only; server authorization remains authoritative.

Date inputs display through the browser/MUI field but emit canonical strings: date `YYYY-MM-DD`, time `HH:mm`, range `{from,to}` with empty values normalized according to explicit caller policy. Monetary/decimal values are passed through as strings; this library does not parse them with `Number`.

## Migration pilots

1. Existing `SelectIsland` in `frontend/src/components/muiRuntime.js` delegates to `CgSelect`, preserving hidden/native fallback synchronization and legacy form reset behavior.
2. Existing native field island uses canonical date/time/text handling through `CgTextField`/date primitives when the original input type is `date` or `time`, preserving native submitted values.

Legacy `kit.js` remains a deprecated transition layer. The migration ledger records `Select`, native filter/date fields, dialogs and overlays as migrate-to-canonical targets and removal requires zero direct consumers plus browser characterization.

## Accessibility / responsive

- labels and helper/error text use stable `aria-describedby` relationships;
- select/autocomplete retain MUI keyboard semantics (arrows, Home/End, typeahead where supported);
- dialogs/drawers rely on MUI focus trap and focus restoration;
- Escape closes reversible overlays; irreversible flows may require explicit action;
- compact controls remain usable at 390/430 px and 200% zoom without fixed-width assumptions;
- reduced-motion and light/dark/system come from canonical theme/tokens.

## Preventive controls

A #620 authority audit fails closed when canonical interaction exports are missing, `muiRuntime` bypasses `CgSelect` for migrated select islands, another local overlay authority appears in the vNext area, or the interaction contract is absent from the authoritative contract runner.

## Verification

Required evidence on the final candidate:

- source contract RED→GREEN for exports, error/date helpers, migration ownership, and pilot delegation;
- `node --check` on changed JS/MJS;
- authoritative contract runner includes #620;
- component/library authority audits;
- frontend build;
- Chromium pilot QA for select/date/filter and overlay keyboard/focus at desktop + 390/430 + zoom 200%, light/dark/system and reduced motion when executable.

Provider/runtime blocks are reported `BLOCKED` or `NOT_EXECUTED`, never PASS. No merge/closure is claimed if a material local/browser criterion cannot be replaced by real evidence.
