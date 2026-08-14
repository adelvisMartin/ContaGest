# ContaGest-VE ERP Design System v11.16

## Canonical styling contract

`frontend/src/styles/erp-system.css` is the only authored runtime styling entrypoint for new work.

Historical files are preserved under `frontend/src/styles/legacy/` so existing module contracts do not disappear during the migration. Their former public import paths are compatibility shims and must not receive new selectors. The canonical file loads legacy behavior in named cascade layers and then applies the ERP tokens/components/responsive contract.

### Cascade order

1. framework / historical primitives;
2. historical module styles;
3. historical security/login styles;
4. semantic theme compatibility;
5. runtime/shell compatibility;
6. canonical tokens;
7. canonical base typography;
8. reusable components;
9. utilities;
10. responsive rules;
11. accessibility.

This is deliberately based on the enterprise-shell patterns previously benchmarked from SAP Fiori, Microsoft Fluent/Power Apps, IBM Carbon and Salesforce Lightning: reduce visible chrome before squeezing content, preserve clear information hierarchy, use moderate typographic weights and treat mobile navigation as a drawer rather than a compressed desktop sidebar.

## Typography

### Current project fonts

The existing HTML loads these font families:

- Inter: 400, 500, 600, 700, 800, 900;
- Roboto: 400, 500, 700, 900;
- Ubuntu: 500, 700;
- Courier Prime;
- Material Symbols Outlined (icons).

The effective ERP shell is standardized on **Inter** through `--cg-font-sans`. Monospaced financial/code data uses the `--cg-font-mono` system stack with Courier Prime as a final project fallback.

### Weight scale

- body/data: 400;
- navigation/inputs/context: 500;
- buttons/labels/table headings: 600;
- page/section headings: 650;
- KPI/display values: 700.

Normal ERP UI must not introduce 800/900/950 as a default visual hierarchy. Legacy heavy utilities are capped by the canonical stylesheet.

## Apple SF Pro / SF Compact / SF Mono files supplied for review

The supplied DMG packages are Apple San Francisco font installers. They are **not committed to the repository and are not redistributed as web fonts**.

Reason: Apple's published San Francisco license places material restrictions on embedding/distribution and on use outside Apple-platform UI mockups/app contexts. For a cross-platform web ERP, committing those font binaries as downloadable web assets would create an avoidable licensing problem.

Safe approach:

- keep Inter as the cross-platform branded UI font;
- use standards-based `system-ui`/platform fallbacks where native typography is desired;
- use `ui-monospace`/`SFMono-Regular` only as installed-system fallbacks, never bundled from the supplied DMGs;
- do not upload or expose the DMG/font binaries through the application.

If a separately licensed commercial font is supplied later with explicit web embedding rights (`woff2`/webfont license), it can be introduced through the token `--cg-font-sans` without changing module CSS.

## Core layout tokens

- desktop sidebar: 248px;
- mobile drawer: 264px (smaller phones may reduce further);
- desktop header: 64px;
- mobile header: 56px;
- normal control: 40px;
- radii: 8 / 10 / 14px;
- responsive rule: mobile-first reflow, never global horizontal overflow;
- table overflow belongs to table wrappers only.

## Reusable component contract

Existing production pages keep using the stable exports already provided by `frontend/src/components/ui/kit.js` (`PageHeader`, `Button`, `Field`, `Badge`, `EmptyState`, `DataTable`, etc.). They are not renamed or shadowed.

The new canonical primitives live in `frontend/src/components/ui/erp.js` and are re-exported by `frontend/src/components/ui/index.js` with an explicit `Erp*` namespace so migration can be incremental and non-breaking:

- `ErpStack`;
- `ErpRow`;
- `ErpGrid`;
- `ErpCard`;
- `ErpPageHeader`;
- `ErpButton`;
- `ErpField`;
- `ErpBadge`;
- `ErpEmptyState`;
- `ErpDataTable`;
- `ErpUi` for grouped access.

These render the canonical `cg-ui-*` classes from `erp-system.css`. Existing pages can be migrated incrementally; a wholesale rewrite is intentionally avoided because fiscal/accounting behavior must not change as a side effect of a UI refactor.

## Responsive rules

### Phone

- navigation is an overlay drawer;
- no full-width desktop action cluster is squeezed into the header;
- page actions wrap vertically when needed;
- grids collapse to one column;
- tables own their horizontal scrolling;
- the document itself never widens beyond the viewport.

### Tablet

- main content uses full available width when drawer navigation is active;
- reusable grids reflow automatically;
- control sizes stay touch-friendly;
- secondary metadata is removed before collision.

### Desktop

- persistent 248px navigation while open;
- header/main consume `viewport - sidebar`;
- collapsed navigation restores exactly 100% application width;
- rate/account/search controls follow the existing no-overlap shell gate.

## Rule for future work

Do not add another `v11xx.css` override file. Extend tokens/components in `erp-system.css` or migrate a legacy selector into the canonical component model. A new stylesheet requires an architecture reason, not a visual patch.
