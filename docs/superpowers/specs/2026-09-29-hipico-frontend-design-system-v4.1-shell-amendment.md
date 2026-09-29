# Control Hípico UI System v4.1 — Shell, Density and Navigation Amendment

## Status
Approved and implemented on `feat/hipico-ui-system-v4`.

This amendment extends UI System v4 with the shell and density requirements approved after visual review of the deployed Control Hípico interface.

## Goals
- make every primary desktop view consume the full available workspace width;
- provide a collapsible desktop sidebar with persistent local state;
- add a permanent global operations header with quick access to theme, configuration, help and capture;
- standardize button/input density and alignment;
- use canonical SVG icon actions for recognizable utilities without creating a second design system;
- preserve touch ergonomics, accessibility and mobile navigation behavior;
- strengthen Playwright contracts so layout/theme/density regressions are blocking assertions when the browser suite executes.

## Shell contract
### Desktop
- sidebar expanded width: 224px;
- sidebar collapsed width: 66px;
- content area: fluid, `max-width: none`, consumes all width remaining after sidebar;
- sidebar collapse state is presentation-only and persists locally;
- collapsing the sidebar must increase the current main workspace immediately;
- navigation remains keyboard-operable and each collapsed item retains an accessible name/title.

### Mobile / touch
- desktop collapse state must not replace or damage the existing mobile header/navigation;
- visible actionable controls preserve a 44px touch target;
- desktop compact density is enabled only where pointer ergonomics allow it.

## Global header
The desktop shell exposes:
- current view/context;
- active group / local-device status where applicable;
- quick capture action;
- theme shortcut;
- quick-options menu containing System / Claro / Oscuro, Configuración and Ayuda.

Theme preference remains presentation-local and must not mutate business data or workspace financial configuration.

## Density
Desktop operational controls use a compact scale:
- utility/icon actions: 32–36px visual control;
- default operational button/input: 36px;
- exceptional emphasis controls may reach 38px;
- default control typography: approximately 13px / semibold;
- dense financial/tabular data uses tabular numerals;
- touch/coarse pointer overrides preserve at least 44px.

All icon and text content must be centered through canonical flex alignment rather than per-view positional overrides.

## Icon authority
Do not introduce MUI or another icon package solely for Hípico. Extend/reuse the existing canonical SVG registry in the Hípico UI authority.

Icon-only controls are appropriate for conventional utilities such as:
- theme;
- settings/options;
- help;
- copy;
- sidebar collapse/expand;
- dismiss/close where unambiguous.

Every icon-only button must have an accessible label and tooltip/title. High-consequence or ambiguous actions keep visible text, optionally paired with an icon.

## Full-width consistency
Dashboard/Resumen, Captura, WhatsApp, Adelantadas, Participantes, Historial, Cierres y saldos/Reportes, POLLA and Configuración share the same fluid shell contract. No primary view may reintroduce a centered global `max-width` container.

Inner cards/grids may of course define their own responsive column constraints when required for readability; those constraints cannot shrink the global workspace itself.

## Visual identity
UI System v4 remains the authority for:
- equestrian green / neutral ivory-charcoal palette;
- semantic success/warning/danger colors;
- light/dark/system themes;
- unified typography and spacing;
- compact `CONTROL HÍPICO` brand lockup.

The legacy `logo-control-hipico.png` horse wordmark is not rendered by the operational shell.

## Accessibility
- keyboard focus remains visible;
- collapsed navigation is operable by keyboard;
- icon-only controls expose accessible names;
- theme menu uses menu/menuitem semantics;
- coarse-pointer controls preserve 44px targets;
- reduced-motion rules remain active;
- no functionality may depend only on color.

## Playwright acceptance
The v4.1 shell suite asserts:
1. every primary view is fluid/full-width;
2. sidebar collapses to ~66px and expands the main workspace;
3. collapse state persists after reload;
4. collapsed navigation remains operable;
5. global theme/options controls work and persist;
6. the legacy horse wordmark is absent from rendered UI;
7. desktop button/input density stays inside the approved scale;
8. mobile navigation ignores desktop collapse state;
9. visible touch buttons meet the 44px target;
10. light and dark modes satisfy distinct deterministic computed visual contracts;
11. exact-SHA screenshots are generated and asserted non-empty for representative desktop/mobile light/dark views.

The broader existing Hípico matrix for responsive views, keyboard/focus, offline/loading/error/empty states and anti-overlap remains in force. No `skip`, `only`, arbitrary sleeps, forced interaction or fabricated green evidence is permitted.

## PWA
The service worker caches v4 CSS/JS shell assets and rotates its shell revision whenever presentation assets change so installed clients do not remain pinned to stale design layers.

## Non-goals
This amendment does not alter:
- betting calculations;
- balances or financial rules;
- Supabase persistence/authorization;
- WhatsApp business automation;
- IndexedDB ownership;
- participant/race domain semantics.
