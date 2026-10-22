# #773 · Competitive Visual Delta + Shared UX Convergence (2026-10-15)

**State:** PARTIAL implementation, exact-SHA PR verification outstanding. **Single owner:** `frontend/src/design-system/uxContract.v1.js` + its active adapter `frontend/public/design-system/contagest-ux-contract-v1.css`. No new palette, icon pack, cloned component library or vendor code.

## Provenance and evidence boundary

Inputs: owner-supplied `CONTAGEST_REFERENCIAS_Y_PLAN_2026-10-14.md` (market study, **not** proof of live competitor flows), existing `docs/design-system/ERP_VISUAL_BENCHMARK_V15.md`, `docs/benchmark/benchmark-matrix.v1.json`, and the repository's CSS/UX contract files. External reference claims remain *reference-only* until audited and version-stamped under #707/#764; no competitor HTML/CSS/assets copied. Wink POS self-describes mobile USD/Bs checkout and non-fiscal receipts; do not infer fiscal certification from visual parity.

### UX matrix: source ≠ functionality

| Surface | Reference pattern (not a copied UI) | Canonical ContaGest authority | Verified source finding | Functional status | Follow-up acceptance and owner |
| --- | --- | --- | --- | --- | --- |
| Sidebar / navigation | Modern ERP collapsed rail, clear active group | v15 visual benchmark; shared Cg* component system | v15 defines 244px sidebar, 68px rail and Ctrl+K; CSS alone is not E2E | NOT_VERIFIED | Mobile + keyboard module navigation over 58/60 registered routes, #773/#640 |
| Page header / actions | One primary action per contextual view | Cg* and UX contract | v15 states compact headers and non-global KPI strips | PARTIAL | No orphan buttons; functional + visual route QA, #773/#659 |
| Cards / summaries | Restrained visual density | Semantic token authority, not vertical-specific CSS | Existing tokens expose radius, shadows, spacing | PARTIAL | Light/dark and 200% zoom; chart cards render same geometry, #773/#645 |
| Forms / select / date | Touch-first from POS references, accessible clinical filters | `contagest-ux-contract-v1.css`, `UX_CONTRACT_V1` | Gap found: mobile 44px rule covered buttons but omitted form controls | PARTIAL | This PR: coarse 360/390/430 text/date/select/textarea 44px; native checkbox/radio/range excluded; Chromium computed-style evidence |
| Filter toolbars | Visible scope, applied filters and reset action | Shared Cg* form/data contract | No end-to-end behavior evidence in market report | NOT_VERIFIED | Test date/filter changes + reset + keyboard focus on actual tables; #773/#621 |
| Dialogs / destructive actions | Explicit confirmation and retained context | Shared Cg* dialog and a11y contract | Existing UX contract requires trap/restore and Esc | PARTIAL | Browser focus trap, ESC, destructive confirmation negative, #773/#645 |
| Tables and financial rows | Dense, tabular amounts and bounded horizontal scroll | Cg* data/table contract | v15 documents money not elided; product flow not demonstrated | PARTIAL | 320–1440px, two currencies, exported filtered scope; #773/#771 |
| Dashboards | Canonical, drill-down KPIs | Canonical BI authority #771, not decorative UI | Competitor marketing is reference-only | NOT_VERIFIED | Real server-derived KPIs and drill-down, two tenants, #771 |
| Empty/loading/error | Explicit information, not blank white screens | `UX_CONTRACT_V1.states` | Contract catalog exists, but full 58-route coverage not demonstrated | PARTIAL | Error/no-results/loading/offline-stale and retry semantics, #773/#659 |
| Light/dark/system/focus | Consistent geometry and visible focus | `semanticTokens.v1.js` generated CSS + UX adapter | Existing keyboard focus color uses `--cg-v-focus`; forced-color override missing | PARTIAL | This PR: OS forced-colors uses `Highlight`, no copied hex palette; keyboard Chromium scenario |
| POS sale / cash drawer | Wink/Alegra mobile quick payment and return change | Sales/POS/tender domain #765 + UX #773 | User-provided market study only, no real checkout observed here | NOT_VERIFIED | Human workflow from first item to receipt, FX snapshot, Decimal, touch accessibility, #765 |

**Status semantics:** `VERIFIED` requires actual source + accepted runtime behavior for a specific SHA; `PARTIAL` records only the concrete source/contract noted; `NOT_VERIFIED` is never evidence of absence. All UI/browser tests on this candidate remain `NOT_EXECUTED` until run artifacts say otherwise.

## This implementation slice: accessibility without design fork

1. Extend the existing CSS behavior adapter only. On coarse pointers up to 760px, text/date/number input, select and textarea get the canonical `--cg-v-control-touch` minimum (44px); native hidden/checkbox/radio/range are excluded. Fine-pointer desktop layout stays unchanged.
2. In OS forced-colors, use system `Highlight` for keyboard visible focus while keeping the existing 2px outline. Both light/dark/system use the same geometry; semantic token CSS remains generator-owned.
3. Add source-level Node 22 tests and a Chromium Playwright fixture at 360/390/430px and forced-colors. The fixture does **not** replace the full application route matrix, screen reader/device QA or real POS functional tests.
4. Run existing UX visual/functional gates and independent P1 review before claiming completion.

### Evidence commands

```sh
node --test tests/ux_touch_focus_issue_773.test.mjs
npx playwright test qa/ux-touch-focus-v773.spec.mjs --project=chromium --workers=1
npm run audit:visual:strict
npm run test:visual
npm run test:browser:functional
npm run test:browser:a11y
```

The PR-scoped `ux-touch-focus-v773.yml` workflow runs the two targeted checks on a checked-out candidate SHA; status is unverified until its jobs finish. P1 independent review should confirm no CSS precedence regression and no product-wide overflow on touch devices.

**Rollback:** revert the CSS extension and its test/docs/CI additions; no migration or production data touched. Do not merge this partial scope as if all #773 criteria were satisfied. The owner's final physical QA stays deferred.

## Revisión de alcance del lote multi-ticket (2026-10-22)

La matriz de brechas precedente sigue siendo `PARTIAL/NOT_VERIFIED`, no está resuelta con los incrementos no visuales de #637/#849/#852/#854. No se modifica la autoridad Cg* ni CSS en este lote; las pruebas reales de viewport 360/390/430/768/1366/1920, zoom 200 %, temas, teclado y navegación de 58 rutas continúan pendientes de evidencia exact-SHA. #773 permanece OPEN. No confundir la existencia del contrato de componentes con una convergencia demostrada.
