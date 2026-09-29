# #779 · Runtime RLS audit regression

`SOURCE_REUSE=NONE`

## Purpose

The #635 catalog audit must fail closed while `contagest_runtime` can receive an unconditional `USING (true)` or `WITH CHECK (true)` policy on a tenant-owned table.

This document records the audit boundary only. It does **not** change production RLS and it does not implement the transaction-scoped tenant context owned by #739.

## Rule

For a table with `tenantId`:

- `anon` / `authenticated` + unconditional tenant access => `PERMISSIVE_TENANT_POLICY` (`P0`).
- `contagest_runtime` + unconditional tenant access => `RUNTIME_ALL_TENANT_POLICY` (`P0`).
- a global/shared table without tenant ownership is not classified as a tenant-policy violation.

The runtime exception mechanism is versioned as `RUNTIME_ALL_TENANT_POLICY_ALLOWLIST_V1` and is intentionally empty. Any future exception requires an explicit source change and review; there is no environment-variable bypass.

## Relationship to #739

#779 only removes the false negative from the auditor. #739 remains the architectural fix that must provide server-derived, transaction-scoped tenant identity, fail-closed PostgreSQL helpers and A↔B negative tests under connection-pool reuse.

Until #739 is implemented and verified, the current provisioning SQL that creates `contagest_runtime_backend_all ... USING (true) WITH CHECK (true)` remains a release-blocking finding for tenant-owned tables.

## Evidence policy

- destructive QA is forbidden on production;
- PostgreSQL verification for #739 must use an isolated/ephemeral database;
- GitHub-hosted jobs with no assigned runner/steps are `BLOCKED_INFRASTRUCTURE / NOT_EXECUTED`, never PASS;
- this regression is dependency-free and belongs to the authoritative contract runner through `tests/db_security_audit_v635.test.mjs`.
