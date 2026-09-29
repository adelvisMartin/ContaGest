# React Strangler Migration v1

Issue: #639.

## Strategy

ContaGest migrates legacy route renderers one slice at a time. The route registry remains the stable URL/deep-link authority; authentication, RBAC, license policy, API services and domain rules remain outside React presentation components.

A slice may move to React only after its current renderer and behaviors are characterized. The replacement must use canonical `Cg*` components and the existing service/state contracts. There is no big-bang rewrite.

## Pilot: `ayuda`

The `ayuda` route was selected because it is low risk and presentation-oriented. Its legacy string renderer (`HelpPage.js`) rendered a page header, a Cg* foundation pilot and an operational command table. The React replacement (`HelpPage.jsx`) preserves the same route and operational content while moving the renderer to React + canonical `CgProvider`, `CgPageHeader`, `CgDataTable`, `CgTextField`, `CgButton` and `CgStatusChip`.

The route registry now resolves `ayuda` to `HelpPage.jsx`. Repository consumer search found no remaining direct reference to `HelpPage.js`, so the old renderer was deleted only after consumers reached zero.

## Contracts preserved

- URL/deep link remains `ayuda`.
- Shell navigation and session lifecycle remain owned by `app.js`/router.
- Access/RBAC/license decisions remain outside the page.
- No API or persistence contract was added or changed.
- Theme comes from the canonical `CgProvider`/ContaGest MUI theme.
- Hípico is explicitly outside this migration.

## Migration lifecycle

1. Inventory route and renderer.
2. Characterize observable states/actions and external contracts.
3. Create React/Cg replacement on the same route contract.
4. Verify route registry, states, keyboard/focus/theme/responsive/browser behavior where executable.
5. Search repository consumers of the legacy renderer.
6. Delete legacy only when `consumers = 0`.
7. Record status in `react-strangler-migration-v1.json`.

## Evidence policy

Static/source contracts are preventive evidence, not substitutes for browser execution. Browser/build checks that cannot execute because of runner/runtime infrastructure must be reported as `BLOCKED_INFRASTRUCTURE`/`NOT_EXECUTED`, never PASS. Any real code-level FAIL in the migrated slice blocks completion.

## Next slices

Prefer low-to-medium risk presentation routes before financial/tenant-critical routes. Current suggested order is `profile`, `soporte`, then `configuracion`, each as its own characterized slice or small reviewable batch.
