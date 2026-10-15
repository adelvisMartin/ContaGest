# #647 · Exact-SHA release evidence reporter (local-first, no extra release authority)

**Status:** PARTIAL implementation. This is a **read-only report** over release evidence from canonical gates, notably `scripts/release-candidate-v75.mjs` (#548), `scripts/local-verification-runner-v630.mjs` and clean-room ownership #663. It does **not** launch gates, authorise deploys, supersede release decisions #669/#840, or certify production.

## Contract

`scripts/release-evidence-v647.mjs` requires `--input artifacts/...json --sha <40-hex-git-HEAD>`, rejects a dirty tracked worktree, and emits `artifacts/release/v647/<exact-SHA>/manifest.json` with content digest `reportSha256`. It never contacts GitHub, Vercel, Supabase, WhatsApp or production DB. Input is created from **actual operator-collected artifacts**, not from declarations of intention.

Ten dimensions exactly match issue #647:
`SOURCE_REVIEW`, `LOCAL_STATIC`, `LOCAL_UNIT`, `LOCAL_INTEGRATION`, `LOCAL_POSTGRES`, `LOCAL_BUILD`, `LOCAL_BROWSER_E2E`, `REMOTE_CI`, `REMOTE_DEPLOY`, `PHYSICAL_EXTERNAL`.

- Missing dimensions are `NOT_EXECUTED`; `PASS` needs at least one **nonempty local evidence file** under `artifacts/`, a declared candidate SHA, independent gate ID, and its actual SHA-256. Artifact paths, bytes, digest and proof reuse are checked. Evidence files must remain under the real repository root.
- Valid states: `PASS`, `FAIL`, `BLOCKED`, `NOT_EXECUTED`, `BLOCKED_INFRASTRUCTURE`. The last is only legal for remote CI/deploy, not local PostgreSQL/browser.
- Seven local categories plus a hash-matched GitHub issue inventory and zero open P0/blocking P1 yield `LOCAL_CANDIDATE_READY`. Other categories cannot become `PASS` through GitHub Actions quota bypass.
- `PRODUCTION_READY` additionally requires `REMOTE_DEPLOY=PASS`, `PHYSICAL_EXTERNAL=PASS`, and `REMOTE_CI=PASS` (or an explicitly recorded infrastructure exception for that *remote CI dimension only*). This status does not *deploy* anything.
- The backlog object requires exact candidate SHA, a local inventory proof and lists of `openP0` and `openP1`; blocking P1 prevent local readiness. `risk_accepted` P1 entries require an owner, reviewer and substantive rationale, but no user names, PII or free-text notes are echoed in the report. This is an operator risk decision, not a declaration that a P1 has been implemented.
- If evidence files are maliciously forged, matching digests do not independently prove that a command ran: the originating gate, authenticated account and independent review must still be verified. Never transform source-code inspection into `LOCAL_POSTGRES/LOCAL_BROWSER_E2E=PASS`.

## Example operator input

Generate `artifacts/release/v647-input.json` with the following shape, replacing synthetic values with **real evidence** from the exact checked-out SHA:

```json
{
  "schemaVersion": 647,
  "candidateSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "githubActionsQuotaException": true,
  "checks": {
    "SOURCE_REVIEW": {
      "status": "PASS",
      "proofs": [{
        "path": "artifacts/review/candidate-review.json",
        "candidateSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "gateId": "source-review",
        "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      }]
    },
    "LOCAL_STATIC": {"status": "NOT_EXECUTED"},
    "LOCAL_UNIT": {"status": "NOT_EXECUTED"},
    "LOCAL_INTEGRATION": {"status": "NOT_EXECUTED"},
    "LOCAL_POSTGRES": {"status": "NOT_EXECUTED"},
    "LOCAL_BUILD": {"status": "NOT_EXECUTED"},
    "LOCAL_BROWSER_E2E": {"status": "NOT_EXECUTED"},
    "REMOTE_CI": {"status": "BLOCKED_INFRASTRUCTURE"},
    "REMOTE_DEPLOY": {"status": "NOT_EXECUTED"},
    "PHYSICAL_EXTERNAL": {"status": "NOT_EXECUTED"}
  },
  "backlog": {
    "candidateSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "openP0": [119],
    "openP1": [{"issue": 638, "disposition": "blocking", "owner": "security-team"}],
    "proof": {
      "path": "artifacts/review/github-issues-exact-sha.json",
      "candidateSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "gateId": "github-backlog",
      "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    }
  }
}
```

**Important:** The example intentionally does **not** pass: its placeholders and fake hashes are not valid proof. For each `PASS`, compute a real digest: `sha256sum artifacts/...json` on Unix or `Get-FileHash -Algorithm SHA256 <file>` on PowerShell. Do not include credentials/tokens or customer PII in filenames or plain evidence files. Store full raw secrets in your secret manager, not artifacts.

```sh
npm ci --no-audit --no-fund
node --test tests/release_evidence_v647.test.mjs
node scripts/release-candidate-v75.mjs init --sha=YOUR_SHA
# Execute authoritative local verification gates; collect their genuine output.
node scripts/release-evidence-v647.mjs --input artifacts/release/v647-input.json --sha "$(git rev-parse HEAD)"
```

Note: `release-candidate-v75.mjs` expects an explicit SHA and manages **its own** evidence file; do not substitute v647's input for v75's gate manifest. `v647` is only an audited evidence index and may exit `2` with `NOT_READY`, as designed, until production and physical evidence exist.

## Quality, safety, and ownership

- Node22 contracts: `node --test tests/release_evidence_v647.test.mjs`.
- Negative tests cover missing proof, hash mismatch, cross-SHA claims, directory traversal, duplicate proof, local provider-blocker laundering, unknown status, P0/P1 failures and unapproved risk waivers.
- Source-only V8 evaluation of test callbacks is **not** native Node 22 execution. Full local/PG/browser/provider QA remains `NOT_EXECUTED` until actual artifacts exist. Separate provider evidence from code correctness.
- `[skip ci]` on PR HEAD is an explicit GitHub Free Actions quota measure. Skipped required GitHub checks can remain pending; never label them PASS or bypass required release checks by mutating the workflow.
- No DB migrations, API changes, vendor access, production deployment, existing script rewrites or modifications to other owners #663/#660/#669. Rollback: revert only this reporter, contracts and runbook. Keep #647 OPEN until all its own acceptance gates and independent review are met.

### Known limitations and deferred follow-ups

The input is a snapshot manually created by an operator; no authentication of original command execution or GitHub issue inventory is performed by this offline reporter. To meet full #647 DoD, bind independent gate execution evidence (including clean-room DB tests, financial/tenant reconciliation and full Chromium) to its actual SHA, record the authoritative v75 manifest, obtain security and release-owner review, and independently verify the provider/physical stages at the appropriate time.
