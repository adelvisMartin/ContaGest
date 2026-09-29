# Tenant Isolation Adversarial Matrix v641

Issue: #641.

## Authority

`config/tenant-isolation-adversarial-v641.json` is the canonical reusable matrix for adversarial tenant-isolation coverage. `scripts/tenant-isolation-contract-v641.mjs` validates the matrix and expands every surface into both `A_TO_B` and `B_TO_A` cases.

The matrix complements, rather than replaces, #634 composite tenant integrity and existing RBAC/RLS/service guards. Application code must still derive tenant scope from the authenticated request context; a `tenantId` supplied by path/query/body is never authority.

## Failure semantics

- Foreign resource read/update/delete: respond as not found (`404`) when existence is sensitive.
- Foreign nested reference: reject generically (`409 CROSS_TENANT_REFERENCE`) without echoing foreign tenant/resource identifiers.
- Privilege escalation / reserved role mutation: `403` or tenant-scoped `404` depending on the endpoint contract.
- Lists/search/export/reporting: return tenant-scoped results only; never mix rows from another tenant.

## Required layers

Every matrix surface includes API coverage and at least one persistence layer (`repository` or `postgres`). Critical sales/purchase/fiscal references include service + PostgreSQL coverage. Identity and clinical/vertical surfaces remain explicitly listed even when their enforcement owner is service/repository rather than a composite FK.

## Real two-tenant suite

`qa/tenant-isolation-adversarial-v641.test.ts` uses the existing real-backend harness and an isolated PostgreSQL database supplied by Local Verification v630. It creates deterministic tenant A/B fixtures and validates:

- CRUD IDOR/list/search/update/delete in both directions;
- client-supplied tenant spoofing on create;
- sales/purchase nested foreign references;
- fiscal period foreign references;
- direct SQL composite-FK rejection;
- RBAC foreign-role lookup;
- non-disclosing error bodies.

Fixtures are synthetic and cleaned after each run. The suite must never point at Supabase production.

## Local execution

Run the dedicated contract first:

```bash
node --test tests/tenant_isolation_adversarial_issue_641.test.mjs
```

Then run the real PostgreSQL suite through the repository workspace:

```bash
npm --workspace backend exec -- tsx --test ../qa/tenant-isolation-adversarial-v641.test.ts
```

Local Verification v630 includes this suite in `database` and `full`, so the runner creates a loopback-only ephemeral database and tears it down after execution.

## Review checklist

- No endpoint trusts browser/client `tenantId` as authority.
- New object-reference fields are added to this matrix or explicitly classified elsewhere.
- 403/404/409 responses do not disclose foreign identifiers or tenant existence.
- Any new raw SQL/function path has a tenant-scoping negative.
- Any exception records owner, reason and expiration; silent omissions are failures.
