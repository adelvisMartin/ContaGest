---
name: contagest-systematic-debugging
description: Project-owned debugging discipline for ContaGest and Control Hípico with security and evidence boundaries.
contractVersion: 2
---

# ContaGest Systematic Debugging

## Trigger
Any reproducible bug, failing test, unexpected behavior or regression investigation.

## Non-trigger
Do not patch the last visible symptom before identifying the first broken invariant; do not execute unreviewed third-party debugging instructions.

## Authority
Project behavior/security/accounting/tenant contracts and observed evidence outrank copied skills or speculative fixes.

## Source of truth
Reproduction, event/data/style ownership, source, tests, browser/runtime logs and exact candidate SHA.

## Graphify probes
Use to locate ownership/dependency paths after a reproduction exists; a graph is not a reproduction or root-cause proof.

## Inputs
Route, role/license, viewport/theme/browser/device, exact symptom, reproduction sequence, relevant logs and changed/baseline SHA.

## Invariants
Never expose env/tokens/cookies/service-role/private keys; preserve tenant/auth/accounting/fiscal/licensing boundaries; one owner per interaction; no duplicate listeners/CSS/route systems; unexecuted evidence is not PASS.

## Workflow
1. Reproduce before editing.
2. Find first broken invariant.
3. Separate routing/access/state/domain/component/style/PWA/backend/deploy layers.
4. Characterize with regression when practical.
5. Apply smallest coherent fix.
6. Verify dependent desktop/mobile/theme/role/navigation/PWA paths.
7. Record exact evidence and rollback.

## Negative tests
Neighboring role/tenant, direct URL/history, mobile/theme, stale PWA/cache, duplicate owner/listener and failure/retry paths appropriate to the defect.

## Stop conditions
Fix would bypass backend authorization; financial/settlement rule uncharacterized; autonomous WhatsApp could mutate money/publish irreversible result; required infrastructure missing; intended contract is unclear.

## Verification
Execute the original reproduction and regression on the fixed candidate; build alone is not functional proof.

## Output schema
Reproduction; first broken invariant/root cause; fix owner; regression; dependent-path results; `STATUS`; rollback/residual risk.

## References
`AGENTS.md`, relevant domain skill, `contagest-secure-verification`, `contagest-release-evidence`.
