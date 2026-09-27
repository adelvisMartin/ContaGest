# Software Supply Chain · v550

Issue: #550

## Reproducible chain

The canonical evidence chain is:

`candidate SHA → package-lock.json hash → frozen install/toolchain → build artifact → SBOM → artifact SHA-256 → provenance`

Generate evidence from a clean checkout:

```bash
npm ci
CANDIDATE_SHA=<40-hex> node scripts/supply-chain-v550.mjs generate \
  --artifact=<release-file> [--artifact=<another-release-file>]
```

Outputs are written under `artifacts/supply-chain/v550/<sha>/`:

- `sbom.cdx.json`: CycloneDX 1.5 component inventory derived from the npm v3 lockfile;
- `provenance.json`: source SHA, lock hash, Node/npm/Prisma/platform, frozen-install policy, artifacts and workflow action audit;
- `artifact-checksums.sha256`: SHA-256 of each supplied release artifact;
- `action-audit.json`: every external `uses:` reference and whether it is pinned to a full commit SHA;
- `summary.json`: bounded result summary.

`npm ci` is the only supported release install command. Release automation must never rewrite `package-lock.json`; a changed lock hash creates different provenance and requires review.

## Dependency and action review

Any dependency addition/removal/upgrade requires review of: purpose, maintainer/activity signal, transitive footprint, known vulnerabilities, license/redistribution impact and whether an existing dependency already provides the capability. SBOM diff is the review input; package count alone is not an approval signal.

External GitHub Actions are inventory items. A non-40-hex reference is reported as `ACTION_NOT_PINNED_TO_COMMIT` with P1 severity until reviewed/pinned or covered by a time-bounded exception. Local actions are not treated as external dependencies.

## Vulnerability severity and SLA

- **P0 / critical exploitable in deployed path:** block release/promotion; remediate or remove immediately.
- **P1 / high or credible reachable exploit:** no new release without remediation or a written, time-bounded exception with compensating controls and owner.
- **P2 / medium or uncertain reachability:** triage with reachability evidence and target remediation date.
- **P3 / low/informational:** track during normal dependency maintenance.

An exception must contain package/action, affected versions, CVE/finding, reachability, business reason, compensating control, owner, approval, creation date and expiry. Expired exceptions are findings again; no permanent allowlist.

## Scanner authority

Secret/SAST/dependency tools are evidence producers, not competing policy authorities. Findings are normalized into the severity/exception policy above. Scanner disagreement is retained as evidence and resolved explicitly; the most permissive scanner does not automatically win.

## Licenses/assets

The generated SBOM records lockfile license metadata when present and otherwise `NOASSERTION`; `NOASSERTION` must not be interpreted as permissive licensing. Redistributed application assets and dependencies require provenance/license records. Unknown or incompatible licensing is a release finding, not an inferred approval.

## Attestation

When the hosting/build platform supports signed attestations, attach the attestation to the same candidate SHA and artifact checksum recorded by this script. Platform provenance supplements this local manifest; it does not replace the SHA/lock/artifact linkage.

GitHub Actions is currently `NOT VERIFIED / NON-BLOCKING` for the active operational batch. That temporary execution policy does not suppress supply-chain findings or allow a fabricated scanner PASS.
