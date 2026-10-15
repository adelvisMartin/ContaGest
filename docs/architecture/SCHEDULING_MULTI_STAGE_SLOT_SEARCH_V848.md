# #848 — Multi-stage slot search orchestration (isolated increment)

This is an unmounted, side-effect-free, read-only composition of **existing** #848 authorities:
- `slot-candidates.ts` generates candidate UTC intervals over explicit availability/closure windows.
- `resource-segments.ts` checks exclusive capacity=1 resources across all stage offsets and existing trusted claims.

No second location calendar, policy, resource store or financial/booking authority is introduced. SOURCE_REUSE=NONE.

## Contract and incomplete-search safety

`searchMultiStageSlots({ candidateQuery, steps, existing, limit })` returns suggestions with their full, per-stage resource plan, plus `complete`, `truncated`, `examinedCandidates`, `rejectedByResources`, `scannedBaseCandidates`, and `candidateWindowLimit=256`. Candidate inputs and existing claims are explicitly **server-trusted snapshot inputs**; the helper has no authentication, resource authorization or DB read.

All step occupancies, including their buffers, must fit inside the enclosing candidate interval and availability window. The candidate interval duration must equal the latest stage finish; the envelope buffers must cover every stage buffer extending before/after it. The function rejects invalid envelopes rather than returning apparently available starts that would put a stage outside business hours.

The composition checks at most 256 chronologically ordered candidate starts and returns at most 64 acceptable starts. It validates step and existing-block data even when availability is empty. It never applies the *response* limit before checking resource feasibility. **If the base calculator has additional starts beyond the 256 checked, `complete=false` and `truncated=true` even when no suggestions passed.** Empty plus `complete=false` must never be presented as "no availability." This is not stable pagination or exhaustive time-window coverage.

All times are canonical UTC instants (`YYYY-MM-DDTHH:mm:ss.sssZ`). Client-submitted tenant, resource/location/calendar claims are not authority; the server must derive and verify them and normalize IANA wall-clock requests upstream.

## Verification

After a full checkout and `npm ci`, use the repository's installed TypeScript runner:

```sh
npm --workspace backend exec -- tsx --test ../tests/scheduling_multi_stage_slots_v848.test.mjs
npm --workspace backend run typecheck
```

Local sandbox evidence used a byte-identical TypeScript mirror of `slot-candidates.ts` + `resource-segments.ts` and compiled their `.js` counterparts with `tsc` before running the test file on Node 22.16, because native Node type stripping alone does not resolve authored `.js` runtime imports back to `.ts` source. The isolated source `tsc --noEmit --strict` passed. **These are not full monorepo/HTTP/PG17/browser tests.**

## Not yet completed

This module does not book, reserve capacity, lock a resource or prevent concurrent overbooking. The actual booking writer must enforce PostgreSQL 17 exclusion/capacity constraints and revalidate service requirements, tenant/RBAC, booking policy, entitlements and transactional outbox in a single atomic commit. Two-writer conflict/rollback tests, booking/cancel/reschedule endpoints, waitlist, recurrence, location-based business hours and scheduler UI remain open under #848. The separate timezone API PR #1063 is not subsumed. Rollback is deleting the three newly added unmounted files.

No CI workflows/required checks are disabled. Queued provider results are NOT PASS.
