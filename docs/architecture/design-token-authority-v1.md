# ContaGest semantic design-token authority v1

Issue: #631. Canonical source: `frontend/src/design-system/semanticTokens.v1.js`.

## Contract

The source file owns semantic roles, not business meaning or component markup. React/MUI reads the source through `muiThemeAdapter.js`. Legacy/string UI keeps the stable `--cg-v-*` names through the generated ContaGest CSS adapter. Control Hípico keeps its own runtime and consumes a generated `--hc-*` adapter; its wine/gold editorial brand is an explicit product variant inside the same authority.

Generated CSS is committed because the main app and Hípico are static/PWA entrypoints. `node scripts/generate-design-tokens-v631.mjs --check` must pass before merge/build. A mismatch is drift and fails closed.

## Do

- Add a semantic role to the canonical source when a reusable visual meaning is missing.
- Consume roles through the MUI adapter or generated CSS variables.
- Keep a product variant only when its reason is documented in the canonical source.
- Preserve light, dark and system behavior together.
- Add owner, reason, review date and removal criteria for every temporary fallback.

## Don't

- Add another route/module palette or `createTheme()` palette owner.
- Treat physical names such as `green-500` or `12px` as product/business contracts.
- Edit generated CSS by hand.
- Remove a fallback until its consumers are proven to be zero.
- Move authorization, accounting, tenant or API decisions into design tokens.

## Migration status

Machine-readable mapping and deprecation data live in `docs/architecture/design-token-authority-v1.json`. The current CSS token blocks in the historical visual stylesheet and Hípico `app.css` are transitional rollback fallbacks only; the generated unlayered adapters are the active authority.

## QA matrix

Candidate validation for #631 covers:

- source/generator determinism and duplicate-authority contracts;
- light, dark and system modes;
- semantic contrast roles and focus-visible;
- success/warning/danger/info plus selected/disabled states;
- reduced motion;
- representative widths 360, 390, 430, 768, 1024 and 1440;
- 200% zoom and overflow/clipping on pilot surfaces;
- main app and Hípico entrypoints.

Browser results are evidence only when executed on the exact candidate SHA; an unavailable browser/build runtime is reported as BLOCKED, never PASS.
