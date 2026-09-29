# #622 Clean Code + Refactor Authority — Implementation Plan

**Baseline:** `main@334c7c608229cf53d2f423ccc38ecb0da0e2e51b`

**Goal:** establish one reproducible structural-debt authority and execute one small behavior-preserving cleanup proven by characterization, without changing public API, tenant, accounting, persistence or authorization semantics.

## Scope

1. Add a machine-readable architecture ownership/debt policy with the required finding taxonomy.
2. Add a deterministic Node audit that inventories source files/imports and reports structural findings without deleting code automatically.
3. Characterize a concrete legacy orphan candidate before removal: `frontend/src/components/enterprise.js`.
4. Remove that module only if repository source consumers are zero and preserve its canonical replacements in `frontend/src/components/ui/kit.js` / `ui/erp.js`.
5. Wire the regression contract into the authoritative contract runner.
6. Document residual findings as review-required follow-ups rather than mixing unrelated refactors into this PR.

## Invariants

- No schema/data/API route changes.
- No permission, license, tenant or financial behavior changes.
- No generated finding is treated as proof of dead code unless consumer analysis is zero.
- No cosmetic mass rewrite.
- Findings carry category, severity, owner, evidence and automatic/review classification.
- Audit output is deterministic and machine-readable.

## Verification

- `tests/clean_code_refactor_authority_issue_622.test.mjs`
- `node scripts/architecture-clean-code-audit-v622.mjs --check`
- authoritative contracts when executable
- source/diff review against exact candidate SHA
- provider CI/browser status reported separately and never promoted to PASS without execution

## First refactor batch

`frontend/src/components/enterprise.js` duplicates legacy enterprise presentation helpers already owned by the canonical UI kit and has no repository consumers in current code search. The characterization contract independently scans JS/JSX/MJS/TS/TSX import references before deletion. If any consumer appears, the contract fails and deletion is blocked.
