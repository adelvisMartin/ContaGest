# #134 — GitHub Actions hosted-runner recovery

## Scope

This runbook covers the failure mode where a workflow run is created for the exact candidate SHA but GitHub never assigns a hosted runner. It deliberately does **not** guess whether the external cause is billing, quota, account policy, organization policy, GitHub service health, or another provider-side condition.

## Truth classification

Use `scripts/ci-runner-verdict-v134.mjs` and the exact candidate SHA.

| State | Meaning |
| --- | --- |
| `NOT_EXECUTED` | Run is queued/in-progress or otherwise not completed. |
| `SHA_MISMATCH` | Evidence belongs to a different candidate SHA. |
| `FAIL_CONFIG_OR_STARTUP` | Completed run has no jobs, or a nominal success lacks executed job evidence. Treat as workflow/startup/configuration failure, never as hosted-runner infrastructure. |
| `BLOCKED_RUNNER` | Completed failure has one or more jobs and every job has `runner_id=0` with no steps. No product code executed. |
| `FAIL_EXECUTED` | A runner or step executed and the run failed. Inspect logs; this is no longer #134 evidence by itself. |
| `PASS` | Exact-SHA run succeeded and at least one job shows actual runner/step execution. |

## Minimal probe

Workflow: `.github/workflows/ci-runner-probe-v134.yml`.

The probe has no database, browser, package install, external secret, application build, or deployment dependency. It only proves that GitHub can allocate an `ubuntu-latest` runner and execute two shell steps for the exact candidate context.

A failure before those steps with `runner_id=0` and no steps is strong evidence that application code and dependency installation were never reached.

## Recovery procedure

1. Freeze the candidate SHA and record it in the issue/PR.
2. Inspect the probe run and its jobs. Do not infer status from the red/green run icon alone.
3. If verdict is `FAIL_CONFIG_OR_STARTUP`, validate workflow YAML/event filters and repair repository configuration before discussing runner infrastructure.
4. If verdict is `FAIL_EXECUTED`, inspect the first failing step/log and debug that concrete failure.
5. If verdict is `BLOCKED_RUNNER`, check the external control plane available to the repository owner, without changing product code by hypothesis:
   - GitHub Actions is enabled for the repository/organization;
   - GitHub-hosted actions are allowed by organization/repository policy;
   - account/organization billing, spending limits, included Actions usage and budgets are not preventing hosted-runner allocation;
   - GitHub service status does not report an Actions/hosted-runner incident;
   - no organization policy restricts the required runner labels.
6. Re-run the **same candidate SHA** probe after the external condition is corrected. A newer SHA invalidates the old evidence and must be classified separately.
7. Only after the probe is `PASS`, rerun the required product gates for the same SHA: CI/typecheck/lint/build/tests, #155 browser campaign and #157 PostgreSQL/performance.
8. Never convert probe success into product-gate success. Each required workflow must itself execute and pass.

## Issue closure rule

#134 can be closed only when a fresh exact-SHA probe demonstrates real hosted-runner execution and the previously blocked required workflows can start executing steps. If the probe passes but product workflows fail after steps begin, #134 is no longer their blocker; those failures must be diagnosed independently.

## Safety

- Do not bypass required checks by disabling workflows or removing browsers.
- Do not mark pre-runner failures as product failures or passes.
- Do not use production/shared databases as a fallback executor.
- Do not put credentials or billing data in issue comments or artifacts.
