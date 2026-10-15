# #761 · Projects / Time Entry — UTC interval normalization foundation

Status: **MERGED_INCREMENT / PARTIAL after integration**, not a deployed Projects or Timesheet module. `SOURCE_REUSE=NONE`.

This small, side-effect-free backend module is the first security/consistency boundary before designing Project, Task, TimeEntry, approval and cost-to-invoice persistence. The owning issue remains [#761](https://github.com/adelvisMartin/ContaGest/issues/761).

## What exists

- `backend/src/modules/projects/time-entry-period.ts` exports `normalizeProjectTimePeriod` and `parseOffsetTimestamp`.
- Strict ISO 8601 local date-time with explicit `Z` or signed `HH:MM` offset. No timezone-less dates, ambiguous DST fold, JS implicit locale or floating-hour math. Day/month leap calendar validation; duration is computed from UTC instants in **integer elapsed minutes**.
- Bounded window: `(0, 24h]` and whole-minute elapsed duration only. The helper rejects client-reported minutes unless they exactly match the source timestamps.
- Explicit `tenantId/clientId/memberId`, server-fetched `project` and optional `task` evidence. Scope mismatch fails closed. Successful output is frozen, minimal and explicitly carries `billableAuthorized:false` and `invoiceAuthorized:false`.
- Deterministic negative tests for spring-forward, fall-back, invalid calendar and offsets, cross-tenant/project, duration overflow, missing IDs and tampering.

## Invocation and evidence

```bash
node --experimental-strip-types --test tests/project_time_period_v761.test.mjs
# Or:
node --check tests/project_time_period_v761.test.mjs
```

Node 22 is the repository runtime. `backend` TypeScript must still pass its normal project `npm run typecheck`. This file has no external dependencies, migrations, routes, UI or provider calls. Tests are executed directly and do not modify project-wide test manifests or CI workflow budgets.

## Explicit boundaries for the next increments

1. **Never** accept a tenant, project or client reference from the request as proof of ownership. The future authenticated server route must load project/task/member records scoped to the effective tenant and RBAC before calling this helper; the helper only checks **consistency of the supplied evidence**.
2. Timer/manual entries need transactional `TimeEntry` storage, revision/approval trail, concurrency and user authorization before being considered durable or billable.
3. Approved time needs exact-decimal rate snapshot, version/currency and rounding rules approved by the domain owner; nothing in this module computes a monetary amount.
4. Draft invoice generation must reuse existing `SalesInvoice` and its posting/ledger gates, never establish a second billing or payment authority. Transactional invoice linkage and idempotency must reject double billing.
5. Execute real PostgreSQL 17 tenant-negative, auth/role, DST/API, invoice idempotency and Playwright verification before closing #761 or declaring release ready.

Rollback: revert the policy/tests/docs; there are no schema changes or stored entries to migrate. No project finance, inventory, tenant permissions, billing or product API is activated by this increment.
