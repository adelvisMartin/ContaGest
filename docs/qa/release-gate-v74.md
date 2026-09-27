# Release Gate 74/75 · Full Product QA

This gate **reuses issue #155 as the only route/state/role/viewport matrix** through `qa/support/erp-e2e-matrix-v155.mjs`. It does not create a second route catalog.

Run shape:

```bash
CANDIDATE_SHA=<40-hex> node scripts/release-qa-v74.mjs init
# execute browser/runtime work and attach sanitized evidence to the generated JSON
CANDIDATE_SHA=<same-sha> node scripts/release-qa-v74.mjs check
```

The generated artifact starts entirely as `NOT_EXECUTED`. A case cannot become `PASS` without evidence, and a longitudinal journey cannot become `PASS` without persistence/refresh evidence. This prevents source review, empty data, or an unrelated green workflow from becoming a release PASS.

Release-specific overlays cover zoom 200%, keyboard-only, screen-reader semantics, light/dark/system, reduced motion, Unicode/long content, slow API, optimistic rollback, offline/reconnect and multi-session behavior. Anti-overlap evidence explicitly covers overflow, occlusion, dialogs/popovers, dense tables/charts, long text, touch targets, focus, contrast and theme consistency.

Longitudinal journeys are required for Dentistry, Veterinary, Gym/Routines/Nutrition and Control Hípico. Performance evidence records measured route/render/chunk/API/DB/export/memory baselines; no arbitrary budget is introduced before a baseline exists.

Accessibility references #99 instead of duplicating its authority. GitHub Actions for the current operational batch is `NOT VERIFIED / NON-BLOCKING`; the evidence file remains truthful even when CI cannot run.
