# Issue #848 — wall-clock resolution, isolated scheduling increment

## Source of truth

BusinessLocation.timezone is the existing tenant-scoped IANA identifier. The resolver is pure and does not introduce another location, booking, capacity or attendance authority. SOURCE_REUSE=NONE.

Read-only endpoint after normal BusinessLocation route mounting:

GET /api/v1/business-locations/:id/time/resolve?localDateTime=2026-11-01T01:30&disambiguation=earlier

- Authenticated tenant context is required by the existing router.
- A server-owned BusinessLocation is selected with where: {id, tenantId}; arbitrary timezone/tenant parameters cannot override it.
- Input must be strict ISO-style local civil time without an offset: YYYY-MM-DDTHH:mm[:ss], years 1970–9999. Explicit disambiguation=reject|earlier|later, default reject.
- Unique local time returns a UTC ISO instant (utcInstant), normalized local input, timezone and a disambiguated boolean.
- Spring gap and fall overlap without a choice return safe HTTP 409 with stable SCHEDULING_LOCAL_TIME_NONEXISTENT or SCHEDULING_LOCAL_TIME_AMBIGUOUS; invalid civil time/timezone returns 400. 404 for a foreign/missing location does not reveal which tenant owns it.
- Source code samples timezone offsets in a bounded 72-hour neighborhood and round-trips candidate instants through Intl to avoid 24-hour UTC arithmetic and naive DST normalization. The runtime's ICU/tzdata version remains relevant and must be recorded in deployment evidence.

## Validation

Run the following in a full Node 22 checkout and record its exact SHA:

- node --experimental-strip-types --test tests/scheduling_wall_clock_v848.test.mjs
- tsc --noEmit --target es2022 --module nodenext --moduleResolution nodenext backend/src/modules/scheduling/wall-clock.ts
- backend lint/typecheck, ephemeral PostgreSQL two-tenant HTTP test, and Chromium route smoke.

Unit/source-contract verification is not equivalent to API/DB E2E or release.

## Not yet delivered under #848

This endpoint is a conversion preview, NOT evidence of availability. No slots, bookings, capacity allocations, recurrence materialization, transactions, waitlists, or Cg* scheduler are created. Booking writers must enforce concurrent claims in PostgreSQL 17 and revalidate intervals under tenant/RBAC authority. #849 service requirements, #852 entitlements and #853 side effects remain external owners. Issue #848 remains OPEN until its complete acceptance matrix is proven.
