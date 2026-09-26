# Raw SQL audit #544

Candidate work is bound to the PR head SHA; PASS is never inherited from an earlier commit.

## Root-cause classification

The 15 findings produced by `audit:raw-sql-security` were scanner findings, not 15 independently confirmed SQL-injection vulnerabilities.

| Surface | Count | Classification | Control |
|---|---:|---|---|
| `commercial/service-restrictions.routes.ts` method declaration | 1 | scanner false positive | sink matching now requires an executable member call |
| `commercial/service-restrictions.routes.ts` `CASE_FIELDS` | 7 | source-controlled structural projection | exact file + expression classification; runtime values remain bound |
| `media/media.routes.ts` `table` | 1 | closed structural identifier | parsed enum plus exact `care-patient→CarePatient / gym-member→GymMember` mapping locked by regression |
| `health-dental-financial.routes.ts` `dentalFinancialLinkSelect` | 2 | source-controlled SELECT/JOIN fragment | exact file + expression classification; runtime values remain bound |
| `veterinary-financial.routes.ts` `financialCaseSelect` | 4 | source-controlled SELECT/JOIN fragment | exact file + expression classification; runtime values remain bound |

## Security invariants

- Request/body/query/header-derived SQL interpolation remains forbidden.
- Approval is exact by file and expression; no wildcard or global inline bypass exists.
- `approvedDynamicSql` remains empty.
- Parameter values continue through PostgreSQL bind placeholders rather than SQL text interpolation.
- Media table identity cannot be taken directly from request text; upload input is parsed by the closed `entityType` enum and the table mapping remains explicit.
- A structural-fragment classification is not an authorization bypass; tenant/RBAC checks remain unchanged.

## Required evidence

The final candidate must execute:

```bash
npm run typecheck
npm run audit:database-authority
npm run audit:raw-sql-security
node --test tests/raw_sql_security_68_75.test.mjs
npm run test:contracts:current
npm run build:backend
```

Expected Raw SQL result: `findings=0`. Any new request-derived interpolation or unclassified dynamic SQL fails the gate.
