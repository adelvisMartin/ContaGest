# 55/75 · Fail-closed runtime validation for the access manifest

## Problem

53/75 established `access-manifest.json` as the single route-access source and 54/75 derived role route permissions from it, but consumers still trusted the JSON shape at runtime.

A malformed manifest could therefore compile and be consumed with duplicated routes, unknown modes/areas, an invalid tier or a landing route that the selected business mode cannot access.

## Resolution

A shared ESM runtime contract now validates the manifest before exporting it.

`contagest-ve-backend/access-manifest` is the only runtime package surface used by frontend consumers. Backend TypeScript re-exports the same validated runtime object through its typed wrapper.

Validation fails closed when any of these conditions are violated:

- schema version is not 1;
- areas or module mode lists are empty/duplicated;
- a route is duplicated;
- a module points at an unknown area;
- tier is outside `core | advanced | demo`;
- a module references an unknown business mode;
- required route metadata is missing;
- `adminOnly` or `coreAccess` are not booleans;
- a business mode has no landing;
- a landing references an unknown route;
- a landing route is not enabled for its own mode;
- a landing is declared for an unknown mode.

## Runtime authority

The validated object is immutable at the exposed contract boundaries:

- manifest areas/modes/landings/modules;
- route → permission map;
- permission → license-module lists.

Frontend `moduleCatalog.js` and `accessControlService.js` no longer import the raw JSON file.

## Verification

`tests/access_manifest_runtime_validation_55_75.test.mjs` exercises valid and deliberately corrupt fixtures and confirms frontend consumers use the validated package surface.

Exact-SHA GitHub Actions are authoritative for executed CI. Jobs that fail before running any step remain `BLOCKED_INFRASTRUCTURE #134` rather than application-code failures.
