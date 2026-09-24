# 56/75 · Canonical license module boundary

## Problem

The access manifest is now the single route authority, but license issuance still accepted arbitrary strings in `modules[]` and heartbeat/validation accepted arbitrary route telemetry.

The license administration page also built its selectable module list independently from the canonical catalog.

## Resolution

### Backend

- license module values must exist in the validated access manifest;
- duplicate requested modules are collapsed before provisioning;
- validation/heartbeat route telemetry is restricted to `login` plus authenticated manifest routes;
- legacy stored license module lists are filtered to known canonical routes when serialized;
- trial-role provisioning defensively canonicalizes modules even when called internally.

### Frontend

- selectable license modules come from `MODULE_CATALOG`;
- existing sector defaults remain behavior-compatible;
- every default is filtered through the canonical route set before rendering;
- the old `DemoAccessService.modules` union is no longer an entitlement authority.

## Compatibility

Legacy business sectors that do not yet have a dedicated manifest mode keep the existing `comercio` fallback defaults.

This change does not rewrite existing license rows. Unknown historical module strings simply stop being exposed as active modules.

## Verification

- `tests/license_canonical_modules_56_75.test.mjs` locks backend and frontend boundaries;
- `vertical_entitlements_52_75.test.mjs` now validates canonical catalog use instead of the retired manual union.

Remote exact-SHA execution remains separate; zero-step Action failures are classified as `BLOCKED_INFRASTRUCTURE #134`.
