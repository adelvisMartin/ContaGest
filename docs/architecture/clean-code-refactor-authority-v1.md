# Clean Code + Refactor Authority v1

Issue: #622.

## Authority

`config/architecture-clean-code-authority-v1.json` defines the finding taxonomy and safety rules. `scripts/architecture-clean-code-audit-v622.mjs` is the reproducible structural inventory/audit entry point. It reports evidence; it never deletes code automatically.

Each finding records `type`, `severity`, `file`, `symbol`, `evidence`, `owner`, and whether the result is automatic or requires human review. P0/P1 correctness and boundary findings are prioritized above cosmetic cleanup.

## Boundaries

Preferred dependency direction is:

`route/controller -> application/domain service -> repository/persistence adapter -> PostgreSQL/Prisma`

and

`UI event -> state/service/client -> API`.

Composition roots own wiring and lifecycle. They must not become a second owner for authorization, accounting, tenant or persistence rules.

## Dead-code rule

A file is not removed because it looks old. Removal requires zero consumers plus characterization of the relevant public behavior. Dynamic imports or runtime registries must be reviewed explicitly where applicable.

## First behavior-preserving batch

`frontend/src/components/enterprise.js` duplicated enterprise presentation helpers now owned by the canonical UI layers (`ui/kit.js`, `ui/erp.js`, `vnext/index.js`). Repository code search found no consumers. The #622 characterization contract performs an independent source-reference scan; the removal commit is guarded by the same zero-consumer rule.

No public route, backend API, persistence, RBAC, tenant, licensing or financial behavior is changed by this cleanup.

## Residual findings

The audit intentionally reports review-required debt instead of broad in-ticket rewrites. In particular, a composition-root mutation of `AccessControlService.canAccessRoute` in `frontend/src/app.js` is classified `BOUNDARY_VIOLATION/P1`. It is not silently moved in this first batch because authorization/licensing behavior is high-risk and deserves a dedicated characterization/refactor follow-up if still present after this ticket.

## Allowlist policy

Any future exception must name an owner, concrete reason and expiry date. Permanent anonymous suppressions are invalid.

## Commands

- `node scripts/architecture-clean-code-audit-v622.mjs --check`
- `node --test tests/clean_code_refactor_authority_issue_622.test.mjs`
- `node scripts/run-authoritative-contracts.mjs`

External CI states remain separate from local/code evidence and are never reported as PASS unless the exact candidate actually executed them.
