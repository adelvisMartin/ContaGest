# Functional gaps, ranking and decisions · #552

**Baseline:** `4c9e52586000e41f5e1ff5191af8752f5a158c79`  
**Matrix:** `benchmark-matrix.v1.json`

## Decision model

A capability is not classified as missing merely because repository search did not find it. `NOT_VERIFIED` is evidence debt. A true functional gap requires route/API/test/history review and, where applicable, a representative runtime check. This prevents benchmark-driven feature fabrication and avoids copying competitors.

## Findings

### P1 · Critical-flow runtime evidence

The highest-value gap is reproducible evidence for critical UX/RBAC/accessibility flows across desktop/mobile and restricted roles. This is tracked by **#588**. The risk is not an asserted missing feature; it is inability to demonstrate the critical path consistently from the current benchmark artifacts.

### P2 · Evidence manifest by vertical

Cross-enterprise and Companies capabilities could not be reliably classified dimension-by-dimension from names alone. **#589** establishes a machine-readable route/API/test/history manifest. Until that exists, affected cells remain `PARTIAL` or `NOT_VERIFIED` rather than false negatives.

### P2 · Clinical/fitness vertical runtime validation

Odontología, Gimnasio and Veterinaria require representative seeded flows before benchmark statuses can be promoted to `VERIFIED`. **#590** owns this work. The benchmark does not infer absence from repository-search misses.

### Control Hípico

#545–#551 provide substantially stronger contract/history evidence for autonomy, policy/tool authority, idempotency/recovery and reliability. The remaining benchmark concern is runtime UX/operational evidence in #588. No benchmark decision may grant the agent financial authority; `financialAuthority=false` remains invariant.

## Product decisions

1. **Evidence before parity claims.** ContaGest will not claim competitor parity for a cell without internal evidence.
2. **No copy-driven roadmap.** External products define comparison dimensions, not UI/code/workflow specifications.
3. **Safety beats autonomy.** For Hípico, lower false-AUTO and zero duplicate financial effects outrank higher autonomous completion.
4. **P0/P1 escalation.** Any security/RBAC/data-loss/double-effect finding discovered by derived runtime work is escalated immediately rather than buried in benchmark scoring.
5. **Privacy boundary.** Benchmark artifacts use synthetic/anonymized data and never store production PII, credentials, WhatsApp payloads or customer financial records.
6. **Reproducibility.** Evidence records include SHA, role, environment, browser/viewport and expected/actual outcome.

## Ranked backlog

| Rank | Issue | Priority | Owner | Exit signal |
| ---: | --- | --- | --- | --- |
| 1 | #588 | P1 | QA + Frontend + Backend | critical flows evidenced desktop/mobile/RBAC/a11y with synthetic fixtures |
| 2 | #589 | P2 | Architecture + QA | every matrix capability has route/API/test/history evidence or explicit NOT_VERIFIED |
| 3 | #590 | P2 | Vertical teams + QA | representative Dental/Gym/Vet flows executed and matrix updated |

## Actions / CI status

Per current project operating decision, GitHub Actions is **NOT VERIFIED / NON-BLOCKING**. This document does not convert unavailable CI evidence into PASS and does not weaken future QA acceptance criteria.
