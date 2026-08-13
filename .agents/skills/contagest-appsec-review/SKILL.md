---
name: contagest-appsec-review
description: Threat-driven AppSec review for ContaGest ERP, multi-tenant data, licensing and commercial controls.
---

# ContaGest AppSec Review

Use the pinned OpenAI `security-best-practices` source as a baseline, then apply this ERP-specific checklist.

## P0/P1 review surfaces
- Authentication/session: HttpOnly/Secure/SameSite cookies, CSRF, refresh rotation/reuse, session revocation, lockout abuse and account recovery.
- Authorization: tenant escape, IDOR, role-to-platform escalation, mass assignment and permission self-grant.
- Data: RLS/PostgREST exposure, minimum DB role, injection/raw SQL, secrets, logs containing credentials/PII, export scope.
- Licensing: stable license hash secret, subscription entitlement, device credential cloning/replay, device revocation and tenant limits.
- Accounting: unauthorized posting/reversal, closed-period mutation, audit-log bypass, duplicate fiscal documents and sequence tampering.
- Commercial: suspended/cancelled subscription bypass, grace periods, multi-company/user limit bypass and seller commission tampering.
- Health: least privilege, sensitive exports, retention and auditability; no compliance claims without review.
- Resilience: encrypted offsite backup, restore drill, ransomware blast radius, dependency/supply-chain compromise.

## Security output
Every finding must include severity, affected route/file, abuse path, precondition, evidence, root cause, proposed fix, regression test and whether it blocks merge.

Do not run destructive exploitation against production. Prefer test/preview or controlled database fixtures.
