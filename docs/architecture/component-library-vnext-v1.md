# ContaGest Component Library vNext

Issue: #619. Canonical owner: `frontend/src/components/vnext/index.js`.

## Architecture

```text
semantic tokens (#631)
  -> canonical MUI theme
    -> Cg* primitives
      -> compositions/domain UI

legacy string/HTML routes
  -> vNext legacy bridge
    -> kit.js (deprecated transition only)
```

The `Cg*` API is the presentation authority for new React work. MUI remains rendering infrastructure; routes must not create competing themes or route-local equivalents of an existing `Cg*` primitive.

## Foundation API

`CgButton`, `CgIconButton`, `CgTextField`, `CgTextarea`, `CgPageHeader`, `CgSection`, `CgStatusChip`, `CgBadge`, `CgMoney`, `CgLoadingState`, `CgEmptyState`, `CgErrorState`, `CgPermissionState`, `CgStack`, `CgGrid`, `CgSurface`, and `CgCard`.

Props are semantic (`tone`, `size`, `loading`, `disabled`, `error`, `helperText`) and constrained by the component contract. Standard DOM/ARIA props pass through to MUI where appropriate. `CgIconButton` requires an accessible label. Components do not accept raw HTML as a primary API.

## States and accessibility

- async actions expose `loading` through disabled + `aria-busy`;
- error state uses `role="alert"`;
- loading/empty/permission states expose status semantics;
- native MUI keyboard/focus behavior remains intact under the canonical theme;
- focus, light/dark/system and reduced-motion semantics are owned by the canonical theme/tokens rather than route-local CSS.

## Legacy migration

`frontend/src/components/vnext/legacyBridge.js` documents the compatibility surface and maps each legacy primitive to its canonical owner. Existing `kit.js` routes are not rewritten wholesale in this ticket. The machine-readable ledger is `docs/architecture/component-library-vnext-v1.json`.

A legacy owner may be removed only after direct consumers reach zero and browser characterization confirms equivalent behavior. New work must not add new mapped primitives to `kit.js`.

## Do

- import presentation primitives from `components/vnext/index.js`;
- use semantic variants and canonical token/theme behavior;
- extend a canonical primitive when a reusable presentation contract is genuinely missing;
- keep domain rules outside the component library.

## Don't

- create a route-local `Button`, `PageHeader`, `StatusChip`, loading state, or money presenter when the canonical primitive fits;
- call `createTheme()` in route/domain files;
- add arbitrary styling props as a business contract;
- hide backend errors behind generic UI-only failures when a safe message/code already exists;
- move permissions, tenant, accounting, tax or persistence logic into components.

## Verification

The #619 contract verifies the owner, required exports, semantic API, legacy ledger, absence of competing `createTheme()` owners, and inclusion in the authoritative contract runner. Browser/build evidence must be tied to the exact candidate SHA; unavailable CI is reported separately rather than treated as PASS.
