# ContaGest-VE UI System Manifest v11.19

## Status

This document is the human-readable manifest for the shared ERP visual/runtime contract. It accompanies the PWA `manifest.webmanifest`; it does not replace it.

- Canonical runtime stylesheet: `frontend/src/styles/erp-system.css`
- Contextual/vertical extension: `frontend/src/styles/vertical-contexts.css`
- Stable component entrypoint: `frontend/src/components/ui/index.js`
- Theme catalog: `frontend/src/data/themeCatalog.js`
- Locale catalog: `frontend/src/i18n/locales.js`
- PWA manifest: `frontend/public/manifest.webmanifest`
- Machine-readable UI manifest: `docs/manifests/contagest-ui-v11.19.json`

## Typography contract

ContaGest uses one product text family and one functional monospace stack.

- Product UI: Inter with system fallbacks.
- Financial/code figures: system monospace.
- Body/data: 400.
- Navigation/inputs: 500.
- Buttons/labels/table headings: 600.
- Page/section headings: 650.
- KPI/display values: 700.

Legacy 750/800/850/900 declarations are not valid targets for new screens. The canonical cascade normalizes visible UI back into the supported scale.

## Spacing and geometry

- Desktop sidebar: 248px.
- Mobile drawer: max 264px / 86vw.
- Desktop topbar: 64px.
- Mobile topbar: 56px.
- Primary mobile touch target: at least 44px.
- Standard control: 40px desktop / 44px mobile.
- Main content must never exceed the available viewport width.
- Tables may own horizontal scrolling; the document must not.

## Form anatomy

A field has exactly two visual layers: label and control. Form containers must not emulate another input outline.

1. Label sits above the control and never floats through the control border.
2. Inputs/selects/textareas own one border only.
3. Forms and field wrappers do not add a second outline/background.
4. Two-column compact grids collapse below 560px.
5. Form actions become full width on narrow phones.
6. Textareas have a minimum usable height and remain resizable.
7. iOS/WebKit inputs remain 16px or greater while focused to avoid zoom.

This contract is specifically designed to prevent the double-outline and label-over-border defects found during mobile QA.

## Shell/mobile contract

- The icon-only ContaGest mark is used in the mobile topbar and sidebar brand mark.
- The sidebar/drawer is rendered above its backdrop; the backdrop may dim page content but must never blur/dim the drawer itself.
- Theme, menu, search and account icon buttons use a centered grid alignment.
- The user/settings panel is fixed to the viewport, not clipped by the topbar, with internal scrolling when required.
- The WhatsApp support control is interactive in all visible modes and remains inside the viewport. `peek` reduces visual prominence without moving the control outside the touchable screen area.

## Theme contract

Themes may change semantic tokens, not component geometry. The baseline choices are:

- Adaptativo por sector
- Claro empresarial
- Oscuro empresarial
- Azul cielo
- Azul suave
- Océano profesional
- Bosque sereno
- Celestial suave
- Espectro
- Ejecutivo
- Finanzas
- Enterprise oscuro

The three newer palettes are inspired by public ColorKit palette families but deliberately darken primary/action colors to preserve useful text/control contrast. Raw pastel swatches must not be used as body text or primary action foregrounds without contrast validation.

## Vertical identities

The vertical palette is a contextual layer over the ERP system rather than a separate application stylesheet:

- Clínica / salud: teal + medical blue.
- Veterinaria: forest green + warm amber.
- Psicología: muted violet + teal.
- Gimnasio / fitness: violet + energetic teal.
- Comercio / vendedor: indigo + teal.

## Internationalization

Global language support currently includes Spanish, English, Portuguese, Simplified Chinese, Hindi and Arabic. Arabic activates RTL. New shared UI strings must go through the global translation API; long legacy copy can retain the Spanish fallback until semantically translated.

## CSS migration rule

`erp-system.css` is the only canonical authored base stylesheet. Historical vertical styling is loaded once from `styles/legacy/verticals.css` in a lower cascade layer. The former top-level `styles/verticals.css` is a compatibility shim and must not receive new rules. This prevents navigation to a vertical module from injecting global form rules late and changing unrelated pages.

## QA gate

A UI batch is not complete until the following are checked:

- phone 320–430px;
- tablet portrait and landscape;
- desktop 1024, 1366 and 1440+;
- light and dark;
- sidebar open/closed;
- user/settings popover within viewport;
- forms without overlapping labels/double borders;
- financial values not clipped;
- RIF/status pairs remain legible;
- WhatsApp click/tap target reachable;
- PWA installed/safe-area behavior where available.

Static/source gates complement browser QA; they do not replace real browser/device execution.
