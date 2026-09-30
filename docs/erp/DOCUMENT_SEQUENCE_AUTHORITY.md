# Tenant Document Sequence Authority (#762)

## Authority

`DocumentSequence` is the single server-side authority for sequential business document numbering in ContaGest. It is tenant-scoped and keyed by:

- `tenantId`
- stable document-family `key`
- `periodKey`

`periodKey` is non-null and defaults to the empty string (`''`). This is the canonical non-reset period. Future annual/monthly resets use explicit values such as `2027` or `2027-01`; no reset policy is inferred from fiscal periods.

Current stable keys:

- `sales.invoice`
- `purchase.invoice`

Future Quote, SalesOrder and PurchaseOrder flows must reuse this service with new stable keys; they must not introduce counters in their own tables.

## Allocation contract

Allocation occurs through `allocateDocumentNumber(...)` and requires an existing Prisma transaction. The service takes a PostgreSQL transaction-scoped advisory lock for `tenantId + key + periodKey`, then performs one `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` operation.

Consequences:

1. Concurrent committed allocations for the same tenant/key/period are serialized and cannot return the same counter.
2. A business transaction rollback also rolls back the counter update.
3. Sales/Purchase retries reuse the existing `runFinancialIdempotentMutation` authority. Replay does not execute the allocator, so the same `Idempotency-Key` cannot consume a second document number.
4. Different tenants and different period keys advance independently.

The counter is PostgreSQL `BIGINT` and TypeScript `bigint`; it is never converted through IEEE-754 `number` for persisted positions. API responses serialize `currentValue` as a decimal string.

## Formatting and overflow

A sequence has `prefix`, `suffix` and `padding` (1..18). The normalized document number is:

`prefix + zeroPadded(currentValue) + suffix`

The allocator fails closed with `DOCUMENT_SEQUENCE_EXHAUSTED` when the configured padding cannot represent the next value. It does not silently widen the format.

Administrative configuration cannot reduce an existing `currentValue`; a rewind returns `DOCUMENT_SEQUENCE_REWIND_FORBIDDEN`. Moving a sequence forward is allowed for controlled migration/continuation scenarios.

## Invoice integration

`POST /api/v1/sales` and `POST /api/v1/purchases` now accept `number` as optional.

- If `number` is omitted, the route allocates from `sales.invoice` or `purchase.invoice` inside the same transaction that creates the invoice.
- If `number` is supplied, it is preserved exactly (after existing request trimming/validation) and the sequence is not consumed. This keeps controlled imports/migrations compatible.
- Existing `@@unique([tenantId, number])` constraints remain the final uniqueness guard for invoice numbers.

No historical invoice is renumbered by the migration.

## Administrative API

Base path: `/api/v1/document-sequences`

All routes require the existing tenant context and existing `admin.manage` RBAC permission.

- `GET /` lists only the active tenant's sequences.
- `GET /?key=sales.invoice` filters within the active tenant.
- `PUT /:key` creates or updates one period configuration.

Example body:

```json
{
  "periodKey": "2027",
  "prefix": "FAC-2027-",
  "suffix": "",
  "padding": 6,
  "currentValue": "125"
}
```

`currentValue` is a string in the API to preserve exact integer semantics. Configuration changes are audit logged.

## Database security

`DocumentSequence` references `Tenant(id)` with cascading tenant deletion. Production physical schema confirms the tenant identity columns are `TEXT`, so the migration uses a `TEXT` foreign key.

The table lives in Supabase's exposed `public` schema but is backend-authoritative:

- RLS enabled;
- DML revoked from `anon` and `authenticated`;
- DML granted to `service_role`;
- service-role policy only.

The application API remains responsible for tenant context + `admin.manage`; clients do not write this table directly through the Data API.

## Verification gates

Focused unit gate:

```bash
npm --workspace backend run test:document-sequence
```

Real PostgreSQL gate (must run only against an isolated ephemeral database):

```bash
DOCUMENT_SEQUENCE_TEST_ISOLATED_DB=1 npm run test:backend:document-sequence:real
```

The dedicated `document-sequence-v762.yml` workflow provisions a PostgreSQL database whose name ends in `_e2e`, validates Prisma, runs unit/typecheck, runs the canonical from-zero + upgrade migration gates, and then executes concurrency/idempotency/API integration tests.

The QA file refuses to run unless `DOCUMENT_SEQUENCE_TEST_ISOLATED_DB=1`, preventing accidental execution against a shared development or production database.

## Source reuse

`SOURCE_REUSE=NONE`.

ERPNext and Tryton were used only as conceptual benchmarks for tenant/company-scoped document numbering. No external source code was copied or imported. The implementation reuses ContaGest's existing transaction, financial idempotency, RBAC, audit and tenant authorities.
