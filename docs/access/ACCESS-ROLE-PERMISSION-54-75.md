# 54/75 · Role permissions derived from the canonical access manifest

## Problem

53/75 established a single route access manifest for all authenticated routes, but frontend default role presets still carried two independently maintained lists:

- `modules[]`;
- `permissions[]`.

That allowed a role to expose a route while lacking the backend permission required by that route, or to retain a route permission after the module was removed.

## Resolution

`AccessControlService` now treats the access manifest as the authority for route permissions:

1. role `modules[]` are filtered to canonical manifest routes;
2. every route permission is derived from those modules;
3. route permissions with no remaining module are removed;
4. explicit permissions that are not route permissions remain untouched as capabilities;
5. persisted/saved roles are normalized on load;
6. module toggles reject unknown routes and re-normalize permissions;
7. demo/user module selections discard unknown routes.

## Invariants

For every normalized role:

- every module exists in the 57-route manifest;
- every enabled module contributes its canonical permission;
- no canonical route permission remains without at least one enabled module requiring it;
- non-route capabilities may still exist explicitly.

This removes navigation/API permission drift without expanding the access manifest into action-level authorization.

## Verification

`tests/access_role_permission_drift_54_75.test.mjs` locks the derivation and fail-closed mutator behavior.

Remote CI is evaluated on the exact candidate SHA. If GitHub Actions again produces jobs with zero steps, that is classified as `BLOCKED_INFRASTRUCTURE #134`, not as a source-code PASS or FAIL.
