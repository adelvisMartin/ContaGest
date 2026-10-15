# #659 · Functional Coverage Inventory (first increment)

## Purpose

This is a fail-closed inventory, NOT a new E2E suite or the completion of #659. It reuses PAGE_REGISTRY, the canonical 60-route visual catalog and qa/support/module-verification-catalog.mjs. The latter was missing sedes and listas-precio; both now have explicit CRUD coverage requirements (which do not imply working flows).

The seven conceptual proof stages are uiEvent → clientState → api → domainService → persistence → response → uiFeedback. The inventory records the page path and leaves unknown API, domain and database ownership as null. File existence is SOURCE_ONLY, never an executed-flow PASS.

Execution remains owned by #155 (ERP E2E evidence), #630 (local runner, real isolated PostgreSQL when needed), #640 (browser matrix), #652 (API contracts) and #632/#633 (DB authorities).

## Commands

From a complete, committed checkout at the candidate SHA:

    node --test tests/functional_coverage_v659.test.mjs
    node scripts/functional-coverage-v659.mjs --expected-sha "$(git rev-parse HEAD)"

The manifest is saved at artifacts/qa/functional-coverage-v659/<sha>/manifest.json. Without verified evidence every route remains NOT_VERIFIED and readiness NO_GO. --strict exits with code 2 until all routes have the required candidate-bound coverage.

Optional evidence input: node scripts/functional-coverage-v659.mjs --expected-sha <sha> --evidence artifacts/qa/coverage-input-v659.json

## Evidence input contract

JSON root: schemaVersion=1, candidateSha=<same HEAD>, routes.<route>.gates.<gate>.
Each PASS gate requires candidateSha, command, environment, artifact (relative path beneath artifacts/) and artifactSha256. The file must exist, remain within the repository after resolving symlinks and match the SHA-256. A recorded command is metadata, not independent proof that the real flow ran; reviewers must inspect the linked execution and result.

Gate identifiers are visual, interaction, frontendE2E, backendPersistence and domain. NOT_APPLICABLE is accepted only for backendPersistence/domain when the declared persistence is none and the record supplies a substantial reason. Unknown gates, unknown routes, SHA mismatch, fake PASS, missing or modified artifacts fail closed.

Status meanings: NOT_VERIFIED means no executed evidence; PARTIAL means some valid evidence exists or failure/blocker is recorded; VERIFIED means all five candidate-bound gates (or narrow applicable exceptions) and the page file are present. VERIFIED is still only a manifest state subject to human review, not production approval. readiness REVIEW_REQUIRED means every route meets this manifest gate, not a release GO.

## Outstanding #659 acceptance

This increment does not complete the capability-by-capability UI/event → state/client → API → service → persistence → response → UI investigation. Every critical/high route still needs its business journey, role/tenant negatives, E2E and PostgreSQL where applicable, API/schema ownership and atomic follow-up issue on actual P0/P1/P2 gaps. Hípico, offline, device QA and Venezuela/OSS feature benchmarks remain separate unmet evidence requirements. Do not close #659.

Rollback: revert the new script, tests, document and the two catalog rows. No runtime UI, API, DB or production data changed.
