# Supabase production convergence — #627

## Authority and scope

Production project: `soxzatxiwlfsvtblrqal` (PostgreSQL 17). The schema authority remains `backend/prisma/schema.prisma` plus the ordered SQL under `backend/prisma/migrations/**`. This runbook does **not** create a second copy of the DDL: the convergence runner reads the canonical historical migrations at execution time and hashes the exact SQL used.

The 2026-09-29 audited production state was behind the repository in five bounded canonical steps:

1. ledger posting lifecycle (`20260827060000_issue_91_ledger_posting_immutability`),
2. ledger closed-period posting gate (`20260827060100_issue_91_ledger_period_gate`),
3. financial FX (`20260927130000_financial_fx_v560`),
4. fiscal authority (`20260927143000_fiscal_authority_v561`; the sibling `fiscal_engine` directory is the historical no-op),
5. data lifecycle (`20260927152000_data_lifecycle_v562`).

The last historical source declared `tenantId UUID` while canonical `Tenant.id` is `TEXT`. The historical migration remains immutable. Production convergence used the same narrow compatibility projection owned by #626: only the five lifecycle tenant UUID columns and the tenant function parameter became `TEXT`.

A forward-only hardening migration follows the convergence: `20260929164500_issue_627_production_convergence_hardening`. It pins `search_path` on the nine new trigger/helper functions and adds covering indexes for the three new foreign keys reported by the Supabase advisor. It does not open RLS, delete rows or rewrite application data.

## Default production gates

The reusable runner remains fail-closed. Its normal production path requires:

- candidate SHA exactly matches `git rev-parse HEAD`;
- project ref is exactly `soxzatxiwlfsvtblrqal`;
- PostgreSQL major version is 17;
- targeted production drift is either the fully-audited prestate or fully converged;
- no waiting locks and no transaction older than 60 seconds;
- ledger ambiguity/integrity preflight is zero;
- a backup artifact less than 24 hours old is bound to the same project and candidate SHA and restored successfully into isolated PostgreSQL 17;
- explicit production apply consent matches the exact SHA.

`db push`, `db reset`, destructive table/schema drops, truncation, deletes and type rewrites are never part of #627.

## Explicit one-time backup waiver — 2026-09-29

For this production convergence, the repository owner explicitly authorized completing #627 without a backup and accepted recreating the current application data/users if recovery were required. The exception is scoped only to this convergence of project `soxzatxiwlfsvtblrqal`; it does **not** remove the backup requirement from the reusable runner or establish a future no-backup default.

The connector-managed apply was allowed only after a fresh read-only preflight confirmed PostgreSQL 17.6, zero waiting locks, zero long transactions, zero ambiguous ledger rows, and a fully consistent pre-convergence target state. No `db push`, `db reset`, `DROP TABLE`, `TRUNCATE`, bulk delete or type rewrite was used.

## Preflight actually observed

Immediately before apply:

- 4 `SalesInvoice`, 0 `PurchaseInvoice`, 7 `LedgerEntry`, 17 `LedgerLine`;
- 0 already-posted entries;
- 0 ambiguous or invalid ledger candidates;
- 3 deterministic sales entries eligible for canonical backfill;
- all ledger/FX/fiscal/lifecycle target objects absent;
- 0 waiting locks and 0 long transactions.

## Production apply result

The five canonical convergence blocks were applied in repository order through Supabase migrations. The only application-row mutation was the canonical ledger backfill: the 3 validated sales ledger entries transitioned from draft to posted with `postedAt` populated.

The physical postcheck after those five blocks reported:

- public tables: 127;
- convergence tables: 14/14 present;
- required functions: 9/9 present;
- required triggers: 11/11 present;
- lifecycle `tenantId`: 5/5 are `TEXT`;
- ledger: 3 posted, 4 draft, 0 invalid posted, 0 posted without `postedAt`;
- fiscal permissions: 4/4 present and 4/4 granted to `Administrador Global`;
- lifecycle global baseline policies: 11 rows.

## Advisor handling

After convergence, Supabase reported two material classes created by the new objects:

- mutable function `search_path` on the nine new functions;
- three foreign keys without covering indexes.

Both are closed by `20260929164500_issue_627_production_convergence_hardening` and are covered by the #627 contract test.

Supabase also reports RLS-enabled tables with no policies. For the new #627 sidecar/authority tables this is intentionally fail-closed: direct `anon`/`authenticated` access is not opened by this ticket. Adding permissive RLS policies merely to silence an informational lint would weaken the boundary. Existing unrelated advisor findings remain owned by their respective backlog/security work and are not represented as fixed by #627.

## Reusable commands

Generate the exact-SHA plan:

```powershell
node scripts/production-convergence-v627.mjs plan
```

Read-only production preflight:

```powershell
$env:CONTAGEST_PRODUCTION_PROJECT_REF="soxzatxiwlfsvtblrqal"
$env:CONTAGEST_CANDIDATE_SHA=(git rev-parse HEAD)
$env:DATABASE_URL="<operator-only connection string>"
node scripts/production-convergence-v627.mjs preflight
```

Normal backup-backed apply remains documented by the runner:

```powershell
$sha=(git rev-parse HEAD)
$env:CONTAGEST_CANDIDATE_SHA=$sha
$env:CONTAGEST_PRODUCTION_PROJECT_REF="soxzatxiwlfsvtblrqal"
$env:CONTAGEST_BACKUP_EVIDENCE="qa/evidence/database-convergence/issue-627-backup-$($sha.Substring(0,12)).json"
$env:CONTAGEST_ALLOW_PRODUCTION_CONVERGENCE="APPLY_627_soxzatxiwlfsvtblrqal_$($sha.Substring(0,12))"
node scripts/production-convergence-v627.mjs apply
```

## Postcheck / local gates

```powershell
node scripts/production-convergence-v627.mjs verify
npm run audit:database-authority
npm run audit:raw-sql-security
npm run migration:test:from-zero
npm run migration:test:upgrade
npm run typecheck
npm run build:backend
```

Also execute the #625 drift audit against production. P0/P1 application-schema drift must be zero before #627 is considered complete.

## Recovery matrix

| Moment | Recovery |
| --- | --- |
| Before a migration transaction commits | Transaction rollback; no partial statements from that migration. |
| After commit, application incompatibility | Prefer a forward fix; application rollback is acceptable only if compatible with the expanded schema. |
| This explicitly waived no-backup run | No point-in-time restore is claimed. The accepted fallback is forward repair and, if necessary, recreation of the current application data/users. |
| Future normal runs | Restore the verified backup when forward repair is unsafe. |
| Drift changes before apply | Abort and regenerate plan/evidence. |

## Evidence policy

`qa/evidence/database-convergence/` contains only machine-readable metadata and hashes. Never commit database dumps, credentials, JWTs, PII, medical records, fiscal documents, invoice bodies or arbitrary row payloads.
