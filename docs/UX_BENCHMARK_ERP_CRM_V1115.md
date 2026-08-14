# ContaGest v11.15 — UX benchmark ERP/CRM shell

## Objective

Reduce visual density and collision risk in the global shell without changing accounting/business behavior. The benchmark focuses on public design-system guidance rather than copying proprietary product markup or assets.

## Reference systems

### SAP Fiori

Patterns adopted:
- The shell bar owns product context and a small set of global actions.
- On small screens, secondary shell actions are removed from the primary line or moved behind compact access points.
- Phone layouts avoid multi-column application shells.
- Search, settings/profile and side-navigation entry are treated as global shell services.
- Responsiveness is achieved by reducing visible shell metadata rather than squeezing every desktop control into the same width.

### Microsoft Fluent / Power Apps model-driven apps

Patterns adopted:
- Space and proximity communicate grouping before decorative separators.
- Responsive layout should reposition, resize, and show less content when necessary.
- Body text stays regular; semibold is reserved for semantic emphasis and controls.
- Model-driven applications use a consistent responsive shell across desktop, tablet and phone.

### IBM Carbon UI Shell

Patterns adopted:
- Desktop side navigation target width is approximately 256 px.
- Compact navigation links use moderate weights rather than extra-bold text.
- On smaller screens the left panel becomes non-persistent and is opened by a hamburger control over a dimmed main surface.
- The header spans the available browser width.
- Header actions use compact fixed touch/click targets and secondary header items collapse before they collide.

### Salesforce Lightning

Patterns considered:
- Global header is a distinct shell layer.
- Application navigation and contextual application content should not be conflated.
- Desktop-only header patterns must not simply be compressed into phone width.

## ContaGest decisions

### Sidebar

Desktop:
- 252 px persistent navigation.
- Main content and header consume `viewport - sidebar` while open.
- Closing the sidebar restores main/header to exactly 100% viewport width.

Tablet/phone:
- Non-persistent overlay drawer.
- Maximum width 292 px and never more than viewport minus 48 px.
- Main content does not reflow sideways when drawer opens.
- Backdrop communicates modal navigation context.
- Quick operation buttons are removed from the mobile drawer to prioritize navigation.
- Footer metadata is removed on phone.

### Header

Desktop:
- One 64 px line.
- Product/menu region, elastic search region, compact global actions.
- BCV rate/source use fixed optical dimensions to prevent line wrapping and collision.
- Lower-priority metadata disappears progressively at 1540 / 1320 / 1160 px.

Phone:
- One 56 px line.
- Menu + compact product title.
- Search becomes an icon that opens the existing command palette.
- Theme and user settings remain direct actions.
- BCV/source/business-mode/language controls leave the phone shell rather than shrinking into illegibility.

### Account menu

- Initials/avatar badge is not used as a separate shell control.
- One profile/chevron trigger opens the menu.
- Desktop uses an anchored 278 px popover.
- Phone uses an anchored fixed popover constrained to the viewport, not a full-screen panel.
- Settings route remains directly accessible.

### Typography

Target weights:
- Body/data: 400.
- Navigation/inputs/context: 500.
- Buttons/labels/section headings: 600.
- Main page heading: 650.
- KPI/display values: 700.

`900` and `950` are not part of the v11.15 shell hierarchy.

### Collision policy

The shell follows a `hide before squeeze` rule:
1. Keep product identity and navigation trigger.
2. Keep search.
3. Keep primary rate when width allows it.
4. Keep update/theme/account actions.
5. Remove source/language/mode metadata before any component can overlap.

## QA gate

The shell regression suite verifies:
- Desktop sidebar open/closed geometry.
- Header right edge always matches the available main area.
- Header reaches 100% viewport when sidebar is collapsed.
- Rate/source/action controls do not overlap at 1366, 1440, 1600 and 1920 px.
- Mobile drawer is <= 292 px and overlays rather than pushes the application.
- Phone header stays in one line at approximately 56 px.
- Document width never exceeds mobile viewport.
- Menu/button/header font weights stay inside the intended hierarchy.
- Account menu opens and navigates to Configuración.
- Theme changes Claro -> Oscuro in a single interaction.
