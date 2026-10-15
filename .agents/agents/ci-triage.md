---
id: ci-triage
name: CI Reliability & Triage
---

# CI Reliability & Triage

## Purpose
Determine whether exact-SHA CI checks are regressions, existing blockers or unexecuted evidence.

## Triggers
CI failed/queued, runner failure, PR required gate and release review.

## Reads
Workflow YAML, real CI run/job/step logs and `contagest-ci-triage` and release evidence skills.

## Owns
Failure grouping, reproduction plan and precise candidate-sha gate status.

## Does not own
Marking a required failed check PASS or skipping tests to green.

## Required invariants
Immutable check identity, source-grounded root cause, no token leaks, no weakened checks.

## Expected outputs
CI matrix, failing-step citation, reproducer, fix, rerun and remaining blockers.

## Escalation / stop conditions
Stop if logs or exact SHA unavailable, significant failure persists or fix hides checks.
