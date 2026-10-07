# #850 — Generated API Contract Projection

## Authority

`#652` remains the only canonical API contract authority. `scripts/generated-api-contract-v850.mjs` is a derived projection only: it reads the #652 manifest and emits deterministic OpenAPI 3.1 metadata plus the generated TypeScript client slice. Do not hand-edit generated output to change API behavior; change the runtime/source visible to #652 first.

The error contract remains owned by #650 in `backend/src/shared/observability/contract.ts`. #850 projects that contract as RFC 9457-style Problem Details fields while preserving the existing `code`, `message`, `correlationId`, optional `requestId`, and optional `details` fields for compatibility.

## Commands

Generate the tracked client and an OpenAPI artifact:

```bash
node scripts/generated-api-contract-v850.mjs --write --out artifacts/generated/openapi-v850.json --audience all
```

Generate a bounded public projection:

```bash
node scripts/generated-api-contract-v850.mjs --out artifacts/generated/openapi-public-v850.json --audience public
```

Run the drift/compatibility gate against the merge base:

```bash
node scripts/generated-api-contract-v850.mjs --check --base main --audience all
```

The same check is covered by `tests/generated_api_contract_v850.test.mjs`, which is part of `npm run test:contracts:current` and therefore of the existing #630 local verification path.

## Determinism and operation IDs

OpenAPI output is stable JSON: object keys, route ordering, permissions, and generated operations are deterministically sorted. No timestamp, random value, environment-specific URL, or secret is emitted.

Every operation receives a required, stable, unique `operationId` derived from its HTTP method and canonical #652 path. A missing/duplicate ID fails closed. Renaming an existing operation ID is classified as a breaking compatibility change.

## Audience isolation and security

Supported projections are `all`, `public`, `tenant`, and `platform`. `public` includes only operations for which #652 reports no tenant requirement and no permission requirement; a privileged operation reaching that projection is an explicit failure. The generator does not fabricate an authentication scheme or cookie name: #652 currently exposes tenant/RBAC guard metadata, so the OpenAPI document preserves that metadata in `x-contagest-auth`.

The current #652 route model does not expose a first-class architecture-domain/audience field. Therefore the `platform` label is conservative and must not be treated as a replacement for runtime authorization. Public exclusion remains fail-closed because every tenant/RBAC-protected operation is filtered.

## Schemas and typing

Request schema metadata is projected as the opaque #652 runtime fingerprint (`x-contagest-runtime-schema`). #652 does not currently expose field-level request/response JSON Schemas, so #850 intentionally does **not** invent model fields. The generated client uses `unknown` response payload types until the canonical authority exposes real response schemas. Consumers must continue to normalize/narrow the returned data at their existing domain boundary.

The first migrated real consumer slice is clients:

`ClientsPage -> SupabaseSyncService -> generated api-client-v850.ts -> GeneratedApiTransport -> BackendApi -> /api/v1/clients -> tenant/RBAC -> service/Prisma/PostgreSQL -> response -> existing client normalizer -> UI state`.

`GeneratedApiTransport` is endpoint-agnostic and delegates to the existing `BackendApi`, preserving cookies, CSRF, refresh behavior, runtime base URL, and existing idempotency policy. #850 introduces no new idempotency semantics.

## Errors

Canonical operational errors expose:

- RFC-style: `type`, `title`, `status`, `detail`, optional sanitized `instance`;
- stable application diagnostics: `code`, `correlationId`, optional `requestId`;
- compatibility aliases/data: `message`, optional `details`.

`instance` is derived from the request path with the query string removed, avoiding accidental disclosure of query parameters.

## Pagination, filters and sorting

#850 only projects query parameters that #652 explicitly provides for an operation. Global take/skip/filter/sort conventions remain visible in `x-contagest-pagination`; the generator does not guess per-route parameters that are absent from #652.

## Compatibility classes

The derived gate classifies changes as:

- `additive`: new operations with no existing operation removed;
- `behavior-sensitive`: request schema or parameter shape changes that require consumer review;
- `breaking`: removed operations, operation ID changes, tightened tenant/RBAC requirements, or other incompatible removals.

Breaking changes fail `--check`. Generated-client drift also fails the gate.

## Adding or changing an endpoint

1. Implement the runtime route/guard/schema in the canonical backend source.
2. Ensure #652 sees the route, request metadata, statuses, tenant/RBAC rules, and deprecation state.
3. Run the #652 gate.
4. Run the #850 generator with `--write` and review the generated diff.
5. Migrate/adjust consumers through the generated client, not a new handwritten endpoint wrapper.
6. Run `npm run test:contracts:current`, backend tests/typecheck, frontend build, and the relevant real persistence/browser gate for the affected flow.

Generated files carry `DO NOT EDIT`; a manual edit that diverges from regeneration is rejected by the drift gate.
