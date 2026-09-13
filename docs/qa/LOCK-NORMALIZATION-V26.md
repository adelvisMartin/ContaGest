# Lock normalization v26

## Purpose

`backend/package.json` no longer depends on ExcelJS. This guard exists to prevent the root `package-lock.json` from retaining the retired ExcelJS/JSZip runtime graph after manifest changes.

## Authority

The checked-in manifests and npm lockfile remain the source of truth. The normalizer only removes the explicitly retired ExcelJS graph and descendants that are proven unreferenced by every surviving lock entry. If any surviving package references a candidate orphan, normalization fails closed with `LOCK_NORMALIZATION_SHARED_DEPENDENCY` instead of deleting it.

## Verification order

1. Unit-test the normalizer, including the shared-dependency negative case.
2. Normalize the retired graph.
3. Run `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`.
4. Verify the lock contract and `--check` idempotence.
5. Require `git diff --exit-code -- package-lock.json`.
6. Run clean `npm ci`.
7. Run the internal XLSX writer smoke test.
8. Stage the serverless backend and reject any ExcelJS/JSZip/es-pako reintroduction.

A generated lock artifact is uploaded before the diff gate so drift can be inspected without weakening the gate.

## Incident classification

A GitHub Actions job that completes with `runner_id=0`, no steps and no logs is infrastructure-blocked under #134. It is not evidence that the lock passed or failed. The checked-in lock must still be updated from executed evidence before this change is merge-ready.
