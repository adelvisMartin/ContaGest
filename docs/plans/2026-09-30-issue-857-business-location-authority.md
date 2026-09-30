# #857 Business Location Authority — implementation plan

Baseline: `main@3a278d0a321ab3e00fd090aeb9d1f82ebec17eeb`.

## Characterization
- Production PG17 read-only inventory found `AddressGeocode` as the reusable geocode authority, no transversal BusinessLocation/Warehouse/Site/Branch table, and legacy domain strings such as `GymClass.location` / `CareAppointment.room` without a safe mapping.
- #755 owns inventory Warehouse/Location, #848 owns scheduling/resources, #765 owns POS register/shift, and #849 owns service eligibility.
- Therefore this ticket introduces only tenant site identity, IANA timezone, safe lifecycle and reusable IDs. It does not backfill ambiguous legacy strings and does not own stock, hours, resources or pricing.

## Implementation
1. Add canonical Prisma `BusinessLocation` and forward migration with tenant/code uniqueness, status constraint, IANA timezone guard and tenant-safe `AddressGeocode` guard.
2. Add tenant-derived API list/get/create/update/deactivate/close/reopen; no hard-delete; admin permission only for writes; audit every mutation.
3. Add frontend service, management page, and reusable `BusinessLocationSelector`.
4. Register backend `/business-locations`, frontend `sedes`, and authoritative regression contract.
5. Validate Prisma, targeted contracts/unit tests, typecheck, frontend build, isolated PostgreSQL 17 migration/invariants and browser component surface.
