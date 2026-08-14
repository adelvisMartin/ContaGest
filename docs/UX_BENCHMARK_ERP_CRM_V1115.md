# ContaGest v11.15 — UX benchmark ERP/CRM shell

## Objective

Reduce visual density and collision risk in the global shell without changing accounting/business behavior. The benchmark uses public design-system guidance and observable interaction patterns; it does **not** copy proprietary application markup, private assets, protected APIs or vendor code.

## Reference systems

### SAP Fiori

Patterns adopted:
- The shell bar owns product context and a small set of global services.
- On small screens, secondary shell actions leave the primary line or move behind compact access points.
- Phone layouts avoid multi-column application shells.
- Search, settings/profile and side-navigation entry are global shell services.
- Responsiveness is achieved by reducing visible metadata rather than squeezing desktop controls until they collide.

### Microsoft Fluent / Power Apps model-driven apps

Patterns adopted:
- Space and proximity communicate grouping before decorative separators.
- Responsive layout should reflow, resize and expose less secondary information as width decreases.
- Body/data text remains regular; semibold is reserved for semantic emphasis and controls.
- Business applications should preserve a consistent shell and interaction model across desktop, tablet and phone.

### IBM Carbon UI Shell

Patterns adopted:
- Desktop navigation stays compact and persistent while space permits.
- Compact navigation links use moderate weights rather than extra-bold text.
- On smaller screens the left panel becomes non-persistent and opens from a hamburger control over a dimmed main surface.
- The header spans the entire available application width.
- Header actions use compact fixed targets and secondary items collapse before they collide.

### Salesforce Lightning

Patterns considered:
- Global header and application navigation are separate from contextual page content.
- Vertical navigation is responsive.
- Desktop-only global-header behavior should not be compressed blindly into phone width.

## ContaGest decisions

### Cascade architecture

The v11.15 shell is the final compatibility layer. `compact-enterprise-v1110.css` is loaded last by `app.js` and now re-imports `enterprise-shell-v1115.css` from that final position. This is deliberate: older inline/legacy density rules were loading after the new shell and could visually reintroduce widths, weights and header geometry that had already been corrected.

The rule is now:

`legacy styles -> responsive foundation -> final v11.15 shell contract`

No new module should append shell geometry after the final compatibility layer.

### Sidebar

Desktop:
- 248 px persistent navigation.
- Main content and header consume `viewport - sidebar` while open.
- Closing the sidebar restores main/header to exactly 100% viewport width.
- Section and item typography use 500–600 weights rather than 800–950.

Tablet/phone:
- Non-persistent overlay drawer.
- Maximum width 264 px; on very small phones it drops to 252 px and never consumes the whole viewport.
- Main content does not reflow sideways when the drawer opens.
- Backdrop communicates modal navigation context.
- Quick operation buttons and footer metadata leave the mobile drawer.
- Only the section containing the active route is expanded initially; the rest remain collapsed until requested.

### Header

Desktop:
- One 64 px line.
- Product/menu region, elastic search region, compact global actions.
- Search copy is task-oriented: `Buscar módulos, clientes o reportes`.
- Rate metadata uses a two-row micro-grid: `TASA DEL DÍA` + value on the first row, source on the second.
- `BCV / Actualizar tasa`, theme and account are fixed-size actions aligned on the same optical axis.
- Business-mode/language selectors do not compete for permanent header space.
- Below the safe width, secondary rate metadata is hidden before any collision is possible.

Phone:
- One 56 px line.
- Menu + compact product title.
- Search becomes an icon that opens the existing command palette.
- Theme and account/settings remain direct actions.
- BCV/source/business-mode/language controls leave the phone shell rather than shrinking into illegibility.

### Account menu

- Initials/avatar badge is not a separate shell control.
- One user-icon + chevron trigger owns profile/settings access.
- Desktop uses an anchored 272 px popover.
- Phone uses an anchored fixed popover constrained to the viewport, not a full-screen/bottom-sheet panel.
- The menu closes on outside click or Escape.
- Settings remains directly reachable through `Empresa y configuración`.

### Theme

- The supported shell contract is binary: `Claro <-> Oscuro`.
- Historical presets are normalized by the store.
- The header control changes theme in one interaction.
- Legacy theme options are removed from the header/account selector so users do not see unsupported intermediate choices.

### Typography

Target weights:
- Body/data: 400.
- Navigation/inputs/context: 500.
- Buttons/labels/section headings: 600.
- Main page heading: 650.
- KPI/display values: 700.

`800`, `900` and `950` are not part of the normal v11.15 application hierarchy. Legacy utility classes are capped to the audited scale by the final compatibility layer.

### Collision policy

The shell follows a `hide before squeeze` rule:
1. Keep product identity and navigation trigger.
2. Keep search.
3. Keep primary rate while there is sufficient width.
4. Keep update/theme/account actions.
5. Remove rate metadata and contextual selectors before any component can overlap.

## QA gate

The shell regression suite verifies:
- Desktop sidebar open/closed geometry.
- Header right edge always matches the available main area.
- Header reaches 100% viewport when sidebar is collapsed.
- Rate/source/action controls do not overlap at 1366, 1440, 1600 and 1920 px.
- Mobile drawer is <= 264 px at 390 px viewport and overlays rather than pushes the application.
- No more than the active sidebar section is expanded initially on mobile.
- Phone header stays in one line at approximately 56 px.
- Document width never exceeds mobile viewport.
- Menu/button/header font weights stay inside the intended hierarchy.
- Account menu opens, fits inside the viewport and navigates to Configuración.
- Theme changes Claro -> Oscuro in a single interaction.
- The account theme selector exposes only `light` and `dark`.
