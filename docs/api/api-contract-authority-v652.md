# API Contract Authority · #652

## Authority

The API contract is **derived from the canonical backend source**. It is not a manually maintained OpenAPI document and it does not replace `backend/src/app.ts`, `backend/src/modules/route-manifest.ts`, route modules, validation schemas, RBAC middleware, or the shared HTTP/error middleware.

`node scripts/api-contract-authority-v652.mjs --check --base main` builds two deterministic manifests:

1. the merge-base contract by reading the base tree with `git ls-tree` / `git show` using the same extractor;
2. the candidate contract from the current worktree.

The gate compares both manifests and fails on incompatible drift. No endpoint lockfile is checked in, so changing a generated JSON file cannot hide a breaking change.

## Contract surface

The projection covers:

- mounted and dynamic method/path routes discovered from `createApp()` and nested routers;
- `MODULE_ROUTE_MANIFEST`, including the standard routes emitted by `createCrudRouter`;
- tenant requirement and explicit `requirePermission(...)` RBAC requirements;
- request-body validation fingerprints from `validateBody(...)` plus the canonical schema corpus;
- observed success/error status literals and validation/auth failure statuses;
- canonical success envelope `{ ok, data, meta }`;
- canonical error envelope `{ ok: false, message, requestId, code?, details? }`;
- correlation header `x-request-id`;
- CRUD pagination/filter/sort convention (`take`, `skip`, `q`, stable `createdAt/id` ordering, and page headers);
- deprecation markers and contract versioning metadata.

Probe/telemetry surfaces are identified separately because health, metrics, and CSP endpoints intentionally do not claim the business envelope.

## Compatibility policy

The gate rejects at minimum:

- removed method/path routes;
- newly required tenant authentication;
- newly required permissions;
- request-schema fingerprint changes;
- removed success status codes;
- success/error envelope drift;
- correlation-header drift;
- pagination convention drift;
- newly introduced duplicate method/path conflicts.

Additive routes and additive error statuses are compatible. A material breaking redesign must be handled deliberately through contract/version/deprecation work; it must not be hidden by regenerating documentation.

## Local verification

```bash
node scripts/api-contract-authority-v652.mjs --check --base main
node scripts/api-contract-authority-v652.mjs --check --base main --out artifacts/api-contract-v652/evidence.json
node --test tests/api_contract_authority_v652.test.mjs
```

The regression is registered in `scripts/run-authoritative-contracts.mjs`; therefore the existing #630 backend/full path consumes it through the canonical `npm test` gate without duplicating #652 logic inside the runner.

## OpenAPI / typed clients

#850 is the owner for generated OpenAPI, typed clients, Problem Details projection, and downstream drift tooling. Those artifacts must be generated **from this authority/source contract** and must never become a second manually edited API authority.
