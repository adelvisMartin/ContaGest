# #848 — Slot candidate read model (bounded foundation)

This is an independent, **unmounted** pure TypeScript helper. `calculateSlotCandidates` produces UTC suggestions, **not confirmed reservations**. There is no API, UI, schema, DB mutation, authorization or persistence in this slice. `SOURCE_REUSE=NONE`.

## Inputs and invariants

- Availability windows and busy/closure intervals are strict canonical ISO-8601 UTC strings with millisecond precision, represented as half-open `[start,end)` intervals.
- Upstream location/business-hours authority must convert wall-clock+IANA timezone to real UTC instants (see #848 `wall-clock.ts` draft) and verify tenant, location, resource, service policy and RBAC **before** this calculator is called.
- The entire buffered candidate `[start-bufferBefore, end+bufferAfter)` must fit in a single availability window and must not intersect any busy/closure interval. Adjacent half-open boundaries are valid.
- Duration and step must be integer minutes 1–1440; buffers 0–1440; a maximum of 64 windows and 64 blockers, each at most seven days. Scanning fails closed above 20,000 examined starts. Only 1–256 slots can be returned, ordered/deduplicated with `truncated=true` when the result was limited.
- Empty availability means **no slots**. Overlapping windows cannot create duplicated slots. No floats, implicit local timezone, `Date.parse` of naive strings, hidden calendar defaults or dynamic DB calls.

## Verify this increment

Run with Node.js 22.16+ and TypeScript 5.8+:

```bash
node --experimental-strip-types --test tests/scheduling_slot_candidates_v848.test.mjs
tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck backend/src/modules/scheduling/slot-candidates.ts
```

These focused tests cover inclusive/exclusive boundaries, buffers, closures, sorting, duplicates, bounded iteration, malformed dates, invalid numeric bounds and independent UTC time across DST. Run full repository gates and end-to-end paths once the helper has consumers.

## Non-negotiable follow-up

A returned slot is **stale the moment it is rendered**. Actual booking writes must revalidate resources in the same PostgreSQL 17 transaction and enforce the conflict/capacity invariant at DB level across all verticals; `calculateSlotCandidates` does not enforce capacity, availability edits, entitlements, waitlist promotion, recurrence or idempotency. Do not expose slot results from a route without tenant/RBAC isolation and consistent server-owned read models. Follow on #848; this slice alone is not acceptance or release.

No GitHub workflow is disabled or added. Provider-queued CI never counts as PASS. Rollback: revert this unmounted helper, test and document without data migration.
