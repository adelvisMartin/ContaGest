# 67/75 · Vertical Schema Authority

Baseline: `main@c410885e5329ebb391ae3113648c860e989358d0`.

## Goal

Keep request validation transport-independent: vertical route handlers authorize, call the
canonical schema, execute domain/persistence work and shape the HTTP response. Zod schema
construction belongs to a domain `*.schemas.ts` authority, not to `*.routes.ts`.

## Authorities

- `communications.schemas.ts`: communication template and render requests.
- `gym.schemas.ts`: Gym core/training/nutrition plus payment, class-booking and membership-status requests.
- `health.schemas.ts`: Health/Dentistry core plus prescriptions and consent lifecycle requests.
- `veterinary.schemas.ts`: Veterinary domain requests, CRUD patch contracts, guardian portal session and lab-result inference type.

## Preserved behavior

This refactor does not change route methods/paths, permissions, SQL, transactions, default values,
coercion, enum values, strictness, error semantics or response payloads. Every migrated request
still crosses an explicit `.parse(...)` boundary before side effects.

The Veterinary CRUD patch schemas remain veterinary-specific instead of reusing the similar Health
contracts because their accepted fields and constraints are not identical.

## Regression gate

`tests/vertical_schema_authority_67_75.test.mjs` fails when a vertical route imports Zod directly,
constructs a request schema inline, stops consuming the canonical authority, or removes the migrated
parse boundaries. It is included in `scripts/run-authoritative-contracts.mjs`.

## Follow-up boundary

68/75 is the Raw SQL Security Audit. SQL changes are intentionally out of scope here so schema
ownership can be reviewed independently from query hardening.
