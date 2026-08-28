# ContaGest VE · Enterprise Hardening status snapshot

Issue: #101  
Snapshot base: `main@a24bec379f9cf9121dcd8164d04f63dc332a608e`  
Evidence class: **SOURCE_REVIEW**

This snapshot turns the Epic into a versioned release-governance reference without pretending the ERP is production-ready because several child tickets were merged.

## Non-negotiable delivery rule

```text
1 ticket
→ 1 branch
→ 1 PR
→ one primary responsibility
→ QA bound to the candidate SHA
```

Allowed evidence states remain:

```text
PASS
FAIL
BLOCKED
NOT_EXECUTED
SOURCE_REVIEW
```

A build, merged PR or closed issue does not silently upgrade a runtime check to PASS.

## Verified current state

### Release governance · #97

PR #149 merged the declarative policy/runbook into `main`, but live branch metadata for this snapshot still reports:

```text
protected: false
required status check enforcement: off
```

Therefore the Epic exit criterion `main protected with real gates` remains **BLOCKED**. The follow-up promotion gate is a separate responsibility: it prevents release promotion from ignoring live governance evidence.

### Observability · #98

GitHub issue #98 is closed as completed, but this snapshot records the area as **SOURCE_REVIEW**, not runtime PASS. Issue lifecycle is useful roadmap metadata; candidate-SHA readiness/logging verification remains `NOT_EXECUTED` until the relevant checks execute for the release being evaluated.

### Accessibility · #99

GitHub issue #99 is closed as completed, but this snapshot records the area as **SOURCE_REVIEW**, not browser/manual PASS. The accessibility foundation can protect future UI work, including #100, but the lifecycle state is not candidate-SHA browser evidence and is not an external WCAG certification.

### Design System · #100

The MUI 9 foundation is progressing in its own branch/PR. Epic #101 records it as **SOURCE_REVIEW / in progress** until its browser, accessibility, visual and bundle evidence executes on the final candidate SHA.

### Production/legal · #29

The technical fail-closed gate is already merged. Production remains **BLOCKED** until real provider identity, competent professional review, approved evidence/attestation and the corresponding runtime configuration exist. Engineering documentation must not manufacture those external facts.

### CI infrastructure · #134

Issue #134 remains open. A job created without runner/steps is infrastructure evidence, not product PASS or product FAIL. P0/P1 Definition of Done cannot be downgraded because Actions is unavailable.

## Wave 2 QA promoted from candidates

The current roadmap has already promoted three cross-cutting verification campaigns:

- #155 — system QA cross-module/state/viewport campaign;
- #156 — golden financial dataset and cross-module reconciliation;
- #157 — performance/capacity baseline and regression budgets.

These orchestrate evidence; they do not replace the underlying financial/IAM/DB/design tickets.

## Exit criteria

Epic #101 remains open until evidence demonstrates all of the following for the ContaGest scope:

- no open P0 findings;
- P1 financial wave backed by PostgreSQL-real tests;
- IAM and DB CI controls demonstrated;
- restore drill demonstrated, not backup-only;
- `main` protected with live real gates;
- golden dataset reconciles supported sales/purchases/ledger/banking/inventory flows;
- negative tenant A→B/B→A coverage on critical resources;
- observability identifies deployed SHA/requestId/readiness;
- accessibility includes automated + manual evidence;
- canonical Design System governs new modules without duplicated primitives;
- legal, SENIAT, clinical, security and production claims do not exceed evidence.

## Product boundary

Control Hípico is intentionally **outside the architectural authority of Epic #101**. It shares this repository temporarily but owns its own Epic #102, QA gates, PWA/APK, WhatsApp safety and release lifecycle.

This boundary prevents a change in Control Hípico from being used to declare an ERP criterion complete, and prevents the ERP Design System from being imposed on Hípico without its own product decision.

## Closure rule

Neither this document, nor closing the first-wave tickets, nor merging a collection of PRs is sufficient to close Epic #101.

The Epic closes only when the exit criteria are backed by code, tests, documentation and candidate-SHA evidence. Any unavailable check remains `BLOCKED` or `NOT_EXECUTED`; it is never converted into a generic “100% ready” statement.

Machine-readable snapshot:

```text
ops/roadmap/enterprise-hardening-v101.json
```
