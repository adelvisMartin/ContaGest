# #656 — Dependency and license governance (local-first)

## Authority

This P2 inventory complements the existing CycloneDX SBOM / provenance generator `scripts/supply-chain-v550.mjs` (#550, consumed by #648). It is **not** another SBOM, vulnerability database, legal opinion or permission to deploy. The package manifests and committed npm v3 lockfile remain the executable dependency source; `config/dependency-governance-v656.json` records the maintainer-defined purpose and owner of each direct dependency.

## Scope and evidence

`node scripts/dependency-governance-v656.mjs --sha="$(git rev-parse HEAD)" --check` reads root/backend/frontend `package.json`, `package-lock.json`, and the owner catalog. It generates `artifacts/dependency-governance-v656/<exact-SHA>/manifest.json` containing direct dependency resolution, owner, purpose, requested version, installed/locked version, license metadata and review findings.

- `FAIL` means an actionable P1 audit failure: missing owner, missing lock resolution, incompatible exact pin, missing workspace or potentially restrictive direct license **requiring legal review** (not an automatic finding of license incompatibility).
- `REVIEW_REQUIRED` flags P2 warnings such as a missing license declaration, stale owner entry or manifest/lock declaration drift. It is not a PASS and must be reviewed; absence of P1 findings is not legal approval.
- `PASS` means only the deterministic static inventory has no findings; it **does not** establish npm install reproducibility, vulnerability status, application build, runtime correctness or license compliance.

The manifest explicitly marks `advisoryAudit`, `cleanInstall`, `build`, `runtime` as `NOT_EXECUTED` and `legalCompliance` as `NOT_VERIFIED`. Run actual `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm audit --omit=dev --audit-level=high`, and the #550 provenance workflow separately, on the same candidate SHA. Record exact output and any advisory without silently treating an unavailable registry as clean.

## Review obligations and accepted existing boundaries

The owner catalog covers each direct dependency in the three workspaces. Some existing overlaps are deliberate and documented rather than automatically removed: Morgan for HTTP access logs versus Pino for structured services; Prisma CLI for generation/migrations versus `@prisma/client` for database runtime. Prisma CLI is currently in backend `dependencies`; classifying it as build-only would need a Docker/postinstall and migration characterization before any move. Tailwind is build-only declared in frontend dev dependencies; removal likewise requires a consumer audit. Browser/backend QR libraries serve different contexts. No package was upgraded or removed by this ticket.

Because `package-lock.json` may retain a compatible but textually different package request (e.g. a previously ranged spec), declaration drift is reviewed instead of claiming `npm ci` failed. The actual resolved version is independently checked for exact-version requests. Copyleft-like license strings are flagged for a separate professional/owner review; no conclusion of incompatibility is inferred from a name alone.

## Regression and rollback

`node --test tests/dependency_governance_v656.test.mjs` covers direct classifications, stale/missing catalog entries, missing resolutions, lock drift, exact pins, workspace links, restrictive/unknown license metadata and schema changes. The generator is read-only except for an ignored artifact manifest; rollback is reverting this isolated ticket's new source/catalog/tests/doc files. It does not change business code, IAM, tenant data, DB schema, runtime dependencies or CI protections.

Integration with the #648 release artifact requires the #550 provenance step and a reviewed dependency governance manifest from the same SHA. An absent manifest must never be presented as passed evidence.


## Transitive dependency review (follow-up #656)

The same lockfile-v3 manifest now includes `transitiveCount` and `transitive[]` for non-direct, versioned `node_modules/` entries, including nested resolutions. Direct paths are excluded to avoid double-counting. The manifest records each resolved version, lockfile license, `optional` bit, and one of two **lockfile-only** classifications (`dev-only-lock-entry`, `runtime-or-mixed-lock-entry`). These classifications are **not proof** that an API image ships a package; #648 must verify the actual image and resolved runtime dependency graph.

- Missing transitive license metadata produces `P2 TRANSITIVE_LICENSE_NOT_IN_LOCK`; do not treat `NOASSERTION` as a license grant.
- Potentially restrictive transitive licenses produce `TRANSITIVE_LICENSE_REVIEW_REQUIRED`. They block this static gate at P1 unless marked dev-only in the lockfile, in which case they still require P2 review. This is a request for legal/owner verification, **not** a conclusion of legal incompatibility.
- The existing CycloneDX authority (#550) must still generate the SBOM and vulnerability/provenance evidence for the **same SHA**; there is no second SBOM generator.
- Full `npm ci`, `npm audit`, licenses/notices, container image contents, release gates and the benchmark/source-adoption firewall remain separately required and must not be inferred from this static inventory.

Regression fixtures: `node --test tests/dependency_governance_v656.test.mjs`, including nested copyleft, dev-only license, missing metadata, link exclusions and deterministic output. No package versions, user data, DB schema or runtime code are changed in this slice.
