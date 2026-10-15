# Architecture Ownership Map — #653

Status: architecture intent and validation; not a production-readiness PASS.

Authority catalog: config/architecture-ownership-v653.json. The route composition root remains backend/src/modules/route-manifest.ts. The physical relational schema remains backend/prisma/schema.prisma; a context owner does not create a separate database or privilege model.

The catalog distinguishes tenancy, auth, RBAC, accounting/ledger, tax, FX, banking, payables, payroll, sales, purchasing, inventory, imports, clinical/fitness verticals, Hípico domain/Bridge/PWA, UI components/tokens, browser QA, exact-SHA evidence, observability and release. Each context has one owner path, public contract path, persistence authority, explicit allowed cross-context dependencies, forbidden shortcut and relevant regression gate.

Declared dependencies are architectural approvals to be reviewed against code, not a static proof that imports exist. The existing architecture-boundary-audit retains its import-direction scan and route-mount checks. Core may not consume optional vertical implementation; vertical packs must use shared contracts rather than ERP internals. Hípico SOURCE is read-only and the Bridge never replaces canonical business API.

Retirement: frontend/src/components/enterprise.js is removed per docs/architecture/clean-code-refactor-deprecation-ledger-v1.json and issue #622; the catalog records the three replacement owners, the zero-consumer contract test and the source issue. No other adapter is claimed retired without consumer proof.

Run locally with Node 22 from repository root:

    node scripts/architecture-ownership-audit-v653.mjs
    node --test tests/architecture_ownership_issue_653.test.mjs
    npm run audit:architecture

The pre-existing architecture CLI now also reads this catalog and rejects invalid/duplicate owners. The authoritative-contract runner includes the regression file. The checker is read-only, has no database credentials or migrations, and does not replace an engineering review. A run is PASS only when actually executed for the candidate SHA.
