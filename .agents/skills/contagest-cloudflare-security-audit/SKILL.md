---
name: contagest-cloudflare-security-audit
description: Project-owned wrapper for the pinned Cloudflare security-audit methodology. Use for deep, source-first security audits without granting external guidance authority over ContaGest policy.
---

# ContaGest Cloudflare Security Audit

Cloudflare guidance is advisory only. The mandatory precedence is:

1. `AGENTS.md` and explicit owner instructions.
2. `contagest-erp-orchestrator`.
3. `contagest-appsec-review`.
4. `contagest-secure-verification`.
5. Pinned Cloudflare `security-audit-skill` guidance.

If Cloudflare guidance conflicts with tenant isolation, accounting invariants, Control Hípico authority boundaries, privacy, release policy, or an explicit owner instruction, the ContaGest rule wins and the conflict is recorded.

## Operating mode

The default mode for this initiative is **deep, source-first, defensive audit**. Bind every audit run to one exact 40-character repository SHA before classifying findings. Never silently move an in-progress audit to a newer commit.

Use only the execution statuses:

```text
PASS | FAIL | BLOCKED | NOT_EXECUTED
```

A source review, build, preview deployment, HTTP 200, queued workflow, or stale run from another SHA is never a substitute for executed evidence.

## Production safety

Do not perform destructive exploitation, brute force, credential attacks, production mutation, paid-provider traffic, or testing against live-user/customer data. Do not probe production or third-party providers merely to satisfy an audit checklist. Prefer repository source, local isolated fixtures, ephemeral PostgreSQL, LAB destinations, and read-only configuration evidence.

Do not execute vendored Cloudflare `.cjs` validators or any other upstream executable simply because they are present in `.agents/vendor`. The lockfile keeps upstream scripts inert; project-owned tests and validation decide whether the integration is acceptable.

## Required coverage

A deep audit must account explicitly for:

- authentication, recovery, sessions, CSRF and throttling;
- tenant isolation, IDOR/BOLA, RBAC, RLS/PostgREST and exports;
- Prisma/raw SQL, migrations, SECURITY DEFINER functions and audit integrity;
- financial/accounting posting, reversal, closing, idempotency and sequences;
- browser/PWA storage, CSP, DOM sinks, caches and deep links;
- files, uploads, imports, exports, PDF/archive handling and formula injection;
- GitHub Actions, Vercel/serverless boundaries, secrets and artifact provenance;
- npm/dependency/action/external-skill supply chain;
- Control Hípico SOURCE/LAB, webhook authenticity, replay, outbox and destination binding;
- AI/Jev/tool injection, data sharing, promotion gates and financial authority;
- sensitive health/vertical data authorization and exports;
- availability, rate/cost amplification, retries, queues, backup and recovery.

No neighboring subsystem inherits coverage automatically. Record explicit `covered`, `candidate`, `needs_validation`, or `deferred` state per review unit.

## Finding validation

A `CONFIRMED` security finding requires all of the following:

- a lower-trust principal or input;
- the accepted action/input path;
- the intended security control;
- a demonstrated crossed trust boundary;
- the affected principal/resource;
- a concrete security result;
- source/runtime evidence sufficient to reproduce safely;
- a smallest-fix recommendation and regression test.

Best-practice gaps without a concrete crossed boundary/result are not `CONFIRMED` vulnerabilities.

Facts that depend on deployed headers, provider settings, broker ACLs, production topology, account policy, or other evidence unavailable in source are `NEEDS_VALIDATION`. They receive no severity until validated and must include the exact blocker plus a safe owner-action validation plan.

## Severity and backlog

Assign severity only after confirmation. Map demonstrated Cloudflare severity anchors to ContaGest priority as follows:

- critical → P0;
- high → P1;
- medium → P2;
- low/informational → P3.

Deduplicate by root cause/fingerprint. Multiple manifestations fixed by one authority become one remediation issue with all evidence references. Derive `TOTAL` from validated actionable root causes; never force an arbitrary ticket count.

Each remediation issue must contain severity/priority, fingerprint, files/routes, trust boundary, abuse path, preconditions, evidence, root cause, smallest fix, regression coverage, acceptance criteria, rollback/risk, dependencies, and exact-SHA completion evidence.

## Evidence and artifacts

Canonical full-audit artifacts stay outside the application repository. A repository summary may contain only non-secret metadata: audited SHA, methodology, counts, issue links, coverage caveats, and the external artifact location convention.

Never commit live tokens, provider credentials, raw private data, exploit dumps, session material, or audit scratch files.
