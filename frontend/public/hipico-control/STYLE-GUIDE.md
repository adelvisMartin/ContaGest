# Control Hípico · Style Guide

## Authority
Control Hípico uses the canonical UI System v4/v4.1 presentation stack. New UI must consume the shared tokens and Hípico semantic aliases; per-view palettes, button sizing, local typography systems and duplicated navigation primitives are not allowed.

## Visual direction
The product language is **Equestrian Operations**: compact, professional and operational. The interface uses neutral ivory/charcoal surfaces, deep equestrian green for primary actions/selection, muted brass as a restrained secondary accent, and semantic state colors only when they carry meaning.

## Typography
Use the native/offline-safe canonical sans stack. Operational scale:
- 11px micro metadata;
- 12px secondary labels;
- 13px desktop body/control text;
- 14px touch/body text;
- 16px section heading;
- 20px page heading;
- 24px exceptional display/KPI heading.

Financial figures use tabular numerals.

## Controls
Desktop defaults:
- utility/icon action: 32–36px;
- button/input/select: 36px;
- exceptional emphasized action: up to ~38px;
- default control text: ~13px semibold.

Coarse pointer/touch overrides preserve at least 44px target height.

Icons and labels are centered through canonical flex rules. Do not apply one-off transforms/margins to align individual icons.

## Icon actions
Reuse the canonical Hípico SVG icon registry. Do not add MUI or another icon package solely for this surface.

Icon-only actions require `aria-label` and tooltip/title. Use them for conventional utilities (theme, settings, help, copy, collapse/expand, dismiss). Keep visible text for ambiguous or high-consequence actions such as creating a race, closing a session/journey, processing results or destructive financial actions.

## Layout
Desktop primary views share one fluid shell:
- expanded sidebar: 224px;
- collapsed sidebar: 66px;
- main/content: full available width (`max-width: none`);
- global operations header: persistent across primary views;
- sidebar collapsed state: local persisted presentation preference.

Mobile keeps its dedicated navigation and does not inherit desktop sidebar collapse behavior.

## Themes
Supported preferences: `system`, `light`, `dark`.

Theme is presentation-local/device-local. It must be applied before first paint and must not mutate business/workspace financial configuration.

Light and dark modes use the same semantic hierarchy; colors may adapt but component meaning, typography, spacing and density do not fork into separate designs.

## Branding
Use the compact `CONTROL HÍPICO` brand lockup. Do not render the historical large `logo-control-hipico.png` horse wordmark in the operational shell or group hero.

## Components
All views reuse the same Button, IconButton, Input, Select, Tabs, Badge, Card, Date/Filter, Navigation, Dialog, Table/Data and KPI primitives/tokens.

Do not create a local cloned button/select/dialog/nav style inside a single view to solve a visual mismatch. Fix the canonical primitive or semantic token instead.

## Accessibility
- visible keyboard focus;
- semantic accessible names for icon actions;
- menu/dialog keyboard semantics;
- reduced-motion support;
- touch targets >=44px on coarse pointers;
- no state communicated only by color;
- no hidden focus/keyboard traps.

## QA contract
The Hípico Playwright matrix remains authoritative for responsive and state coverage. UI System v4.1 additionally verifies:
- full-width primary views;
- sidebar collapse/expansion/persistence;
- collapsed navigation operability;
- global theme/options access;
- removal of rendered legacy wordmark;
- desktop density bounds;
- mobile navigation independence;
- 44px touch targets;
- deterministic light/dark computed visual contracts;
- exact-SHA screenshot evidence.

Never use `skip`, `only`, forced interaction, arbitrary sleeps or fabricated evidence to make UI gates pass.

## PWA
When presentation assets change, update the shell cache revision and include all canonical v4 CSS/JS files required for offline rendering. Design updates must not clear IndexedDB/domain data.
