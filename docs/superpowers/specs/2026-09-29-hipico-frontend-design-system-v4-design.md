# Control Hípico UI System v4 — Design Specification

## Status
Approved and implemented with v4.1 shell amendment.

## Product direction
Control Hípico is an operational horse-racing control console, not a generic admin template. The interface must prioritize dense, fast scanning; restrained equestrian visual identity; clear financial/status hierarchy; and reliable light/dark operation across desktop, tablet and mobile.

The design language is **Equestrian Operations**: neutral ivory/charcoal surfaces, deep equestrian green as the primary operational accent, warm brass as a restrained secondary accent, and semantic colors reserved for state meaning. Casino/neon styling and large decorative branding are explicitly out of scope.

## Design-system authority
The Hípico frontend evolves the existing static/PWA architecture incrementally. It does not introduce React/MUI or another parallel component framework just for this redesign.

Authority is layered as:
1. shared ContaGest semantic primitives;
2. Hípico v3 compatibility layer for existing view markup;
3. Hípico UI System v4 semantic/application layer.

`app.css` remains the stable CSS entry point. New screens/components must consume the canonical tokens/classes rather than create per-view palettes, radii, shadows, button heights or typography scales.

## Typography
Use a single native/offline-safe sans-serif stack. The operational scale is intentionally compact:
- 11px: micro metadata / overline;
- 12px: secondary labels;
- 13px: desktop body/control text;
- 14px: comfortable body/touch text;
- 16px: section heading;
- 20px: page heading;
- 24px: exceptional display/KPI heading.

Buttons default to ~13px semibold on desktop. Financial figures use tabular numerals. Generic `1rem` control typography must not silently inflate buttons and inputs above the approved scale.

## Density and spacing
Desktop favors dense operations while touch remains ergonomic:
- default desktop button/input: 36px;
- compact utility/icon action: 32–36px;
- exceptional emphasized control: max ~38px;
- coarse pointer/touch target: at least 44px;
- cards use restrained 12–14px internal spacing where content density allows it.

Component alignment uses canonical flex/grid rules; icons and labels are centered vertically/horizontally without one-off offsets.

## Semantic palette
### Light
- page/background: soft ivory-neutral;
- surface/card: white/near-white;
- text: near-black charcoal;
- primary operational accent: deep equestrian green;
- secondary accent: muted brass;
- borders: neutral with stronger control-border token for interactive affordances.

### Dark
- page/background: near-black green-charcoal;
- surface/card: dark green-charcoal;
- text: high-contrast warm neutral;
- primary accent: lifted equestrian green;
- secondary accent: muted brass.

Red is reserved for destructive/error states, not global branding.

## Theme authority
Supported preferences: `system`, `light`, `dark`.

Presentation preference is local/device-specific, persisted in a single presentation authority and applied before first paint. Workspace/domain configuration is not the canonical owner of theme. Migration from legacy values may be read for compatibility but new writes go through the presentation authority.

## Branding
The operational shell uses a compact text/mark lockup for `CONTROL HÍPICO`. The historical large horse wordmark `logo-control-hipico.png` is no longer rendered as shell/group-hero branding.

Branding must never dominate race/financial content or consume dashboard card space.

## Component language
Canonical Hípico primitives include:
- Button;
- IconButton / utility action;
- Input / Select;
- Tabs/segmented controls;
- Badge/status chip;
- Card/panel;
- date/filter control;
- navigation item;
- dialog/modal;
- table/data grid surface;
- KPI/stat block.

They share tokens for typography, heights, spacing, radius, border, hover/focus/disabled states and theme behavior.

## Layout
Primary desktop views use a common fluid workspace. The global shell must not apply inconsistent centered max-width containers between Resumen, Adelantadas, Cierres y saldos, Configuración or other primary views.

The v4.1 amendment defines sidebar collapse behavior, header/global utilities and exact density values.

## Responsive behavior
- desktop: sidebar + global operations header + full-width workspace;
- tablet: responsive grid/card reductions without changing design authority;
- mobile: dedicated mobile header/nav and touch-safe controls;
- no horizontal page overflow at supported matrix widths;
- long labels/content must wrap/truncate predictably without clipping adjacent actions.

## Accessibility
- visible keyboard focus;
- semantic labels for icon-only controls;
- sufficient text/control contrast;
- touch targets preserved on coarse pointers;
- reduced-motion support;
- no state conveyed by color alone;
- dialogs/menus preserve keyboard semantics and focus behavior.

## QA / Playwright
The established Hípico matrix remains the baseline and covers primary views across 360/390/430/768/1366/1920 plus landscape/state/focus scenarios.

UI System v4/v4.1 adds explicit contracts for:
- design-token authority;
- typography/density;
- full-width shell;
- collapsible sidebar persistence;
- global theme/options menu;
- legacy branding absence;
- touch targets;
- light/dark visual contracts;
- exact-SHA screenshot evidence.

Chromium is the primary PR browser gate when runners are available; broader engines may remain scheduled. Tests must not use `skip`, `only`, arbitrary `waitForTimeout`, forced interaction, or snapshot/evidence fabrication to manufacture green.

## PWA
All new CSS/JS shell assets are included in the service-worker shell cache and the cache revision is rotated with the redesign. Existing local data/session/business persistence is not cleared by a design update.

## Domain safety / non-goals
UI System v4 does not rewrite or redefine:
- bets or race calculations;
- balances, commissions or settlements;
- Supabase schema/persistence/authorization;
- WhatsApp automation/business rules;
- IndexedDB domain ownership;
- participant/race lifecycle semantics.

The redesign is presentation architecture + interaction shell + QA only.

## Acceptance summary
The implementation is acceptable when the app presents a coherent professional Equestrian Operations identity in both light/dark themes; all primary views share the fluid shell; controls obey canonical density; the old wordmark is not rendered; sidebar/header/theme interactions are accessible and persistent; the PWA serves current assets; and Hípico contracts/Playwright gates execute without known code-level regressions whenever infrastructure is available.
