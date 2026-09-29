# ContaGest Forms & Interaction Library v1

Issue: #620. Canonical public owner: `frontend/src/components/vnext/index.js`.

## Authority

The #619 component library remains the only React presentation authority. #620 extends it with canonical form, selection, date/time, overlay, menu and filter primitives. MUI is rendering infrastructure; routes must not create competing select/dialog/date/filter implementations when a matching `Cg*` primitive exists.

```text
semantic tokens (#631)
  -> canonical MUI theme
    -> Cg foundation (#619)
      -> Cg forms/interaction (#620)
        -> route/domain UI

legacy native/string UI
  -> compatibility islands / bridge
    -> hidden native submission target
    -> deprecation ledger
```

## Form/value contract

- IDs and option values remain strings. Numeric-looking identifiers are never coerced with `Number`.
- Decimal/money inputs remain strings and continue to rely on backend Decimal contracts.
- Date values use `YYYY-MM-DD`; time values use `HH:mm`; no timezone conversion is performed by presentation components.
- Empty, null and absent are distinct. `normalizeOptionalFormValue()` makes conversion explicit.
- `normalizeUiError()` preserves safe `message`, `code`, `field`, `correlationId`, HTTP status and field/form/global scope.
- Permission presentation never replaces server-side authorization.

## Canonical components

Forms and selection: `CgFormField`, `CgSelect`, `CgAutocomplete`, `CgCombobox`, `CgCheckbox`, `CgRadioGroup`, `CgSwitch`, `CgDatePicker`, `CgDateRange`, `CgTimeField`.

Overlays: `CgDialog`, `CgConfirmDialog`, `CgDrawer`, `CgPopover`, `CgMenu`.

Filters: `CgFilterBar`, `CgFilterChip`.

## Async/error behavior

Saving actions expose `aria-busy` and cannot be submitted twice. Confirmation dialogs stay open after a failed asynchronous confirmation, display the normalized recoverable error, and permit retry. Reversible overlays close with normal MUI Escape/focus semantics; confirmation close is suppressed while a save is active.

## Migration pilots

1. `muiRuntime.js::SelectIsland` renders through `CgSelect` while preserving native/hidden synchronization and form-reset behavior.
2. Existing legacy `Field` date/time inputs are promoted selectively to `CgDatePicker`/`CgTimeField`; their hidden native input remains the submitted value target during migration.
3. `Modal.confirm` renders `CgConfirmDialog` with canonical theme, async double-submit protection, recoverable errors and focus restoration. `Modal.open` remains a deprecated legacy HTML compatibility path.

Machine-readable ownership and deprecation data is in `docs/architecture/forms-interaction-v1.json`.

## Accessibility

- Form helper/error copy uses `aria-describedby` relationships.
- Select/autocomplete use MUI listbox and keyboard behavior.
- Dialogs use MUI focus trap/focus restoration; the compatibility confirmation restores the invoking element after close.
- Controls remain compact but do not introduce fixed widths that would break 390/430 px layouts or 200% zoom.
- Light/dark/system and reduced-motion remain owned by the canonical theme/tokens.

## Do

- use controlled `value` + `onChange` for application state;
- preserve string identifiers and canonical date/time strings;
- adapt backend errors without discarding safe metadata;
- reuse `CgFilterBar` and canonical overlay primitives;
- keep legacy adapters explicit and removable only when consumers reach zero.

## Don't

- add route-local `<select>` styling or a new dialog/date library;
- parse decimal/money fields through `Number`;
- silently convert empty strings to null/undefined;
- hide 403/409/422/429/5xx failures behind generic success/failure copy;
- bypass server authorization with client-only permission state;
- remove native compatibility targets before consumer/submission characterization reaches zero.

## Verification

`tests/forms_interaction_issue_620.test.mjs` plus `scripts/forms-interaction-authority-audit-v620.mjs` protect exports, acyclic vNext modules, string/date/error contracts, real migration pilots and the deprecation ledger. Browser/build evidence must be tied to the exact candidate SHA; unavailable infrastructure is `BLOCKED`, never PASS.
