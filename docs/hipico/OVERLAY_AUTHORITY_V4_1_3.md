# Control Hípico v4.1.3 — Overlay and Feedback Authority

## Decision

Control Hípico does **not** add React Hot Toast, Sonner, MUI Snackbar or another overlay package. The Hípico runtime is a static/PWA shell and already owns reusable primitives in `assets/js/ui.js`; introducing a second runtime solely for notifications would create parallel design and lifecycle authorities.

## Responsibilities

### `ui.js`
Presentation primitives only:
- dialog markup via `ui.dialog()`;
- canonical SVG registry;
- semantic toast construction/dismissal;
- enhanced select presentation;
- quick race action markup.

It does not own modal focus trapping, Escape handling, background inert state or focus restoration.

### `dialog-accessibility.js`
Single overlay lifecycle authority for:
- legacy `[role="dialog"][aria-modal="true"]` surfaces;
- native `dialog[open]` surfaces such as the WhatsApp operational center;
- accessible labelling;
- initial focus;
- Tab/Shift+Tab focus trap;
- Escape close routing;
- background `.shell` inert/`aria-hidden` state;
- restoration of focus to the invoking control.

A `MutationObserver` watches only the DOM/attributes needed to detect dynamic dialogs. It does not rewrite their visual content.

## Toast contract

`toast()` in `ui.js` is the single feedback primitive. `notice-bridge.js` adapts `hipico:notice` events to it. Supported tones are `success`, `error`, `warning` and `info`; errors use `role=alert`, other notices use `role=status`. All variants use canonical SVG icons and the v4 convergence stylesheet.

## Visual contract

`ui-system-v4-convergence.css` owns overlay/backdrop/toast surfaces. Desktop uses restrained blur/shadow/radius; mobile presents modal shells as bottom sheets. Light/dark tokens and reduced-motion rules remain authoritative.

## Regression

- `tests/hipico_overlay_authority_v413.test.mjs` prevents lifecycle duplication and parallel toast libraries.
- `qa/hipico-overlay-v413.spec.mjs` checks a legacy modal, the native operational dialog and a semantic toast in Chromium.
- Remote browser results are valid only when jobs execute real steps for the exact candidate SHA. Runnerless jobs remain `BLOCKED_INFRASTRUCTURE / NOT_EXECUTED`.
