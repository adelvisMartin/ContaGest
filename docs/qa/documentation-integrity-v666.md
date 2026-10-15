# #666 — Documentation Integrity Gate

Run `node scripts/documentation-integrity-v666.mjs` from a clean checkout. The verifier returns JSON (`schemaVersion`, `status`, `scanned`, `findings`) and exits nonzero on broken references. It executes no documented commands, accesses no providers, and makes no network requests.

## Entry points

- `npm run test:docs:integrity` — isolated regression fixtures.
- `npm run audit:docs:integrity` — read-only audit of the current repository.
- `npm run verify:local -- --profile docs --base main --dry-run` — inspect the #630 execution plan.

## Coverage and policy

The curated `CRITICAL_DOCUMENTS` list covers repository entrypoints, agent and release evidence, database recovery, architecture, operations, UI, QA, and operator runbooks. It checks local Markdown links, root and workspace npm scripts, Node script paths, and explicit supersession markers. Extend the list only with reviewed documents; unlisted documentation is **NOT VERIFIED**, not certified.

External URLs and `#anchors` are not network-checked; this gate does not demonstrate runtime command success. It is intentionally low-noise and cannot replace typecheck, build, PostgreSQL integration tests, browser E2E, or issue/ADR review.

Fixture coverage: valid links/commands, broken references, superseded authority, traversal prevention, and deterministic JSON reporting. Close #666 only after running the audit on the exact candidate SHA and reviewing its findings.
