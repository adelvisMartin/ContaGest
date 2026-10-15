# Workflow inventory and consolidation — issue #654

## Owner and scope

The canonical live workflow source remains `.github/workflows/`. The explicit classification and primary functional owner of each currently observed workflow are versioned in `config/workflow-inventory-v654.json`. The local, read-only inventory auditor is `scripts/workflow-inventory-v654.mjs`.

The baseline snapshot `main@d9b3d9d9f44a5be84d44fdd23740882cbb3c368b` contains **82** YAML workflows: 10 AUTHORITATIVE, 62 ADAPTER, 4 SCHEDULED, 5 PROVIDER_SPECIFIC and 1 TEMPORARY. Classification is an operational ownership decision, **not** proof of successful CI or of an unused workflow.

## Read-only local gates

From a Node 22 checkout of the **candidate SHA**:

```bash
node scripts/workflow-inventory-v654.mjs
node --test tests/workflow_inventory_issue_654.test.mjs
```

The audit rejects unclassified newly-added YAML workflows, entries referring to removed paths, duplicate manifest entries, invalid category/owner/status, missing top-level name/triggers/jobs, and temporary/superseded retirement without consumer proof. The emitted JSON includes triggers, job IDs/check names, declared permissions, dependencies and artifact retention when parsable.

This is a deliberately low-noise, deterministic static parser for repository conventions. It does **not** replace full YAML parsing, executing the jobs, checking GitHub branch-protection rulesets, security assessment of third-party Actions, or end-to-end browser/PostgreSQL validation. A warning is not a PASS; missing explicit permissions and temporary owners must be reviewed.

## Deferred retirement / safety

The file `.github/workflows/temp-typecheck-repair.yml` contains a temporary, branch-specific GitHub Actions bot commit-and-push repair. It remains `TEMPORARY / REVIEW_REQUIRED`. Do **not** delete it just because its target branch may be old. Before removal, check branch/PR activity, uses/consumers, workflow invocations, required status check names, GitHub rulesets and the active HEAD. Record consumer-proof and rollback.

Preserve scheduled work, browser projects, PostgreSQL fixture isolation, artifact-retention intent and provider-exclusive jobs. Changes to shared gates should go through existing local script owners (#630/#632/#640), not through additional copy-pasted YAML logic. Consolidation beyond this inventory requires explicit source evidence and its own characterisation run.

## Exact-SHA evidence status

The new deterministic Node fixtures were executed in an isolated local directory before GitHub publication. Full repository checkout, lint/typecheck/build, browser/DB suites and the remote exact-SHA pipeline have **NOT** been verified for this branch. They must not be relabeled PASS. Keep #654 OPEN until redundant workflows are proved unconsumed and safely retired, reusable steps are consolidated, rulesets/check names are reconciled and candidate-specific validation is recorded.
