# Cloudflare Security Audit Skill · ContaGest Integration & Audit Design

**Date:** 2026-09-26
**Baseline:** `main@8d5875288ea846efacd5a3d6dd05ab851993c508`
**Target repository:** `adelvisMartin/ContaGest`
**External source:** `cloudflare/security-audit-skill@c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`
**Profile:** `deep`
**Status:** Design approved in chat; implementation plan pending explicit review of this written spec.

## 1. Intent and success criteria

The goal is to integrate Cloudflare's `security-audit-skill` as a **pinned, non-authoritative security methodology** inside ContaGest, then run a source-first, defensive security audit of the current repository and convert validated findings into an ordered GitHub backlog (`1/N`, `2/N`, ... `N/N`) that can be implemented one at a time.

Success means:

1. the Cloudflare skill is pinned to an exact commit and license, not installed dynamically;
2. ContaGest project policy remains authoritative over external guidance;
3. upstream scripts are never executed automatically;
4. the audit covers the major trust boundaries of ContaGest/Control Hípico and records deterministic coverage;
5. findings distinguish `CONFIRMED` from `NEEDS_VALIDATION` and never invent severity for unverified hypotheses;
6. each GitHub issue has enough evidence and acceptance criteria to be implemented independently;
7. no destructive test, production probing, secret exposure, paid-provider traffic, or live-user data testing is performed;
8. every later fix can be traced back to the exact audited SHA and finding fingerprint.

## 2. Policy precedence

Security guidance will be resolved in this order:

1. `AGENTS.md` and explicit owner instructions;
2. `.agents/skills/contagest-erp-orchestrator/SKILL.md`;
3. `.agents/skills/contagest-appsec-review/SKILL.md`;
4. `.agents/skills/contagest-secure-verification/SKILL.md`;
5. pinned Cloudflare `security-audit-skill` guidance;
6. other external advisory material.

If the Cloudflare skill conflicts with tenant isolation, accounting invariants, production safety, WhatsApp authority boundaries, or project release policy, the ContaGest rule wins and the conflict is documented.

## 3. Integration strategy

### 3.1 Pin, do not dynamically install

Add a new source to `agent-skills.lock.json`:

- id: `cloudflare-security-audit`
- kind: `github-skill`
- repo: `cloudflare/security-audit-skill`
- commit: `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`
- license: `MIT`
- trust level: `reviewed-security-guidance`
- namespace: `cloudflare-security`

The source will include the complete security-audit companion set required by the skill, including `SKILL.md`, attack-class/reference markdown, report schema and validators. The existing lockfile rule `executeUpstreamScripts=false` remains unchanged.

### 3.2 Local wrapper

Create a ContaGest-owned wrapper skill, e.g. `.agents/skills/contagest-cloudflare-security-audit/SKILL.md`, which:

- states project-policy precedence;
- selects `deep` full-audit mode for this initial review;
- forbids production exploitation and external provider probing;
- maps Cloudflare findings to ContaGest severity/P0-P3 conventions;
- requires tenant, financial, health-data, WhatsApp, AI/tool, deployment and supply-chain coverage;
- requires GitHub issue creation only after deduplication and validation;
- requires exact-SHA evidence and `PASS | FAIL | BLOCKED | NOT_EXECUTED` status vocabulary.

The wrapper does not copy Cloudflare logic into production code and cannot override application behavior.

### 3.3 Skill verification

Extend existing skill verification only as necessary so that:

- the new source must use a full 40-character SHA;
- the license must be present;
- paths are normalized and traversal-safe;
- vendored file hashes are verified if the vendor cache is materialized;
- the verifier does not execute Cloudflare's validation scripts merely because they are vendored.

## 4. Audit execution model

The audit is a **deep, source-first defensive review** bound to one source ref. Because this environment does not provide truly independent security subagents with OS-enforced isolated sandboxes, the audit will not pretend to meet Cloudflare's independent-agent or runtime-sandbox guarantees when they cannot be enforced.

The execution model is therefore:

1. run deterministic read-only reconnaissance over source and repository configuration;
2. build a trust-boundary architecture map;
3. seed a coverage ledger by subsystem × boundary × attack class;
4. perform multiple separated review passes by security domain;
5. treat source-proven boundary violations as candidate findings;
6. validate candidates with safe static/local evidence only when execution constraints are satisfied;
7. mark any finding requiring production/provider/runtime facts as `NEEDS_VALIDATION` with an exact validation plan;
8. generate report artifacts and issue backlog from the validated result set.

No claim of independent verifier status will be made unless a truly separate verifier executes the validation.

## 5. Audit surfaces

### 5.1 Authentication and session

Review:

- Supabase auth and recovery flows;
- cookies/tokens/session storage;
- refresh/session rotation and revocation;
- login throttling/lockout abuse;
- password recovery redirect and account enumeration;
- CSRF where cookie-backed mutation exists;
- direct URL and server-side authorization behavior.

### 5.2 Tenant isolation and authorization

Review:

- tenant resolution authority;
- IDOR/BOLA across API/resource IDs;
- RLS and PostgREST exposure;
- role and permission self-escalation;
- `platform.*` permission separation;
- mass assignment;
- exports/search/background jobs;
- cache/offline/storage tenant scoping;
- A→B and B→A isolation.

### 5.3 Database and raw SQL

Review:

- Prisma and raw SQL boundaries;
- SQL injection and identifier interpolation;
- RLS bypass or service-role overreach;
- migration drift and unsafe destructive DDL;
- stored procedures/triggers/security-definer behavior;
- append-only/audit guarantees;
- idempotency and race conditions around financial/stateful operations.

### 5.4 Financial/accounting authority

Review:

- unauthorized posting/reversal;
- closed-period mutation;
- duplicate fiscal effects;
- sequence tampering;
- currency/rate manipulation;
- approval bypass;
- reconciliation and ledger mutation authority;
- audit-log bypass.

### 5.5 Client/PWA/browser

Review:

- XSS/HTML injection;
- unsafe DOM sinks;
- CSP and asset origins;
- service-worker/cache poisoning or stale authorization state;
- browser storage of credentials/secrets;
- open redirects;
- insecure deep links;
- export/download handling;
- frontend trust of tenant/role/plan input.

### 5.6 Files, imports, exports and documents

Review:

- upload content-type/size validation;
- path traversal/file name handling;
- formula injection in CSV/XLSX;
- unsafe archive/PDF/document parsing assumptions;
- signed/private file URL exposure;
- export scope and sensitive-field leakage.

### 5.7 Cloud, deployment and CI/CD

Review:

- Vercel/serverless authority splits;
- environment-secret exposure;
- preview vs production boundaries;
- GitHub Actions permissions;
- untrusted PR/script execution;
- artifact provenance;
- branch/release protections;
- deployment SHA identity;
- dependency/postinstall risk.

### 5.8 Supply chain

Review:

- npm lockfile integrity;
- install scripts;
- `npx @latest` usage in trusted vs diagnostic paths;
- pinned external skills/MCPs;
- GitHub Actions pinning;
- dependency override rationale;
- package provenance and audit policy.

### 5.9 Control Hípico / WhatsApp / messaging

Review:

- bridge token handling;
- source/LAB identity binding;
- replay/duplicate delivery;
- webhook authenticity;
- group/tenant/owner scoping;
- autonomous reply authority;
- ambiguous-send recovery;
- message injection and command confusion;
- outbound destination allowlisting;
- audit trail and kill switch.

### 5.10 AI/Jev/agent/tool boundaries

Review:

- prompt/tool injection;
- external model data sharing;
- secret leakage to providers;
- provider output validation;
- model authority escalation;
- tool argument smuggling;
- financial/stateful tool restrictions;
- shadow/promotion gates;
- cost/rate amplification;
- logging of model prompts or PII.

### 5.11 Health/sensitive-data verticals

Review:

- access control around patient/client/animal records;
- sensitive exports;
- least privilege;
- auditability;
- retention/deletion behavior;
- cross-tenant leakage;
- logs and analytics containing sensitive records.

No regulatory-compliance claim is inferred from this technical audit.

### 5.12 Availability and resilience

Review:

- unbounded requests/jobs/uploads;
- rate limiting;
- queue/backpressure behavior;
- memory/process/file exhaustion;
- retry storms;
- backup/restore controls;
- ransomware blast radius;
- failure isolation.

## 6. Coverage ledger

The canonical ledger will record each unit with at least:

- subsystem;
- surface;
- trust boundary;
- attack class;
- source paths;
- assignment/review pass;
- state (`planned`, `covered`, `candidate`, `confirmed`, `needs_validation`, `deferred`, `out_of_scope`);
- evidence references;
- unresolved blocker;
- finding fingerprint where applicable.

A unit is not `covered` merely because a neighboring file or related module was inspected.

## 7. Finding contract

Every confirmed finding must include:

- stable fingerprint/id;
- severity (`critical`, `high`, `medium`, `low`, `informational`);
- ContaGest priority (`P0`, `P1`, `P2`, `P3`);
- affected files/routes/endpoints;
- lower-trust principal;
- accepted input/action;
- intended security control;
- crossed boundary;
- affected principal/resource;
- concrete security result;
- preconditions;
- source evidence;
- safe reproduction or validation evidence;
- root cause;
- smallest effective fix;
- regression test plan;
- merge-blocking status;
- rollback/risk notes;
- dependencies on other findings/issues.

`NEEDS_VALIDATION` records omit severity and state exactly what external/runtime fact is missing and how the owner can safely validate it.

## 8. Audit artifacts

The audit run will produce these canonical artifacts:

- `run-metadata.json`
- `architecture.md`
- `coverage-ledger.json`
- `findings.json`
- `REPORT.md`
- `FINDINGS-DETAIL.md`
- `NEEDS-VALIDATION.md`

Because the Cloudflare skill recommends keeping full-audit output outside the target repository by default, the canonical run artifacts should remain outside the application tree unless an explicitly ignored audit-output path is later approved. The repository may contain a small pointer/summary document, but not raw secret-bearing or scratch output.

## 9. GitHub issue generation

After final deduplication, create:

- one security EPIC containing audit SHA, summary counts, architecture/coverage references and execution order;
- one issue per actionable root cause.

Titles use:

`[SECURITY][<priority>] <N>/<TOTAL> · <short finding title>`

The total is derived from the final actionable set; it is not forced to 51.

Ordering:

1. `P0` critical trust-boundary failures;
2. `P1` high-impact auth/tenant/data/financial/remote-control failures;
3. `P2` medium-impact exploitable weaknesses and hardening required for production safety;
4. `P3` low/informational hardening and operational controls.

Each issue body contains the finding contract, acceptance criteria, tests, rollback, dependency links and explicit completion evidence.

`NEEDS_VALIDATION` items may become separate `[SECURITY][VALIDATION]` issues when owner action or deployment observation is required; they are not mislabeled as confirmed vulnerabilities.

## 10. Issue acceptance criteria template

A finding issue can close only when:

1. root cause is fixed at the authoritative layer;
2. a deterministic regression test exists when practical;
3. tenant/RBAC/financial invariants remain intact;
4. relevant static/type/unit/integration/PostgreSQL/browser/runtime gates actually execute;
5. no test is weakened, skipped, widened with arbitrary timeout, or modified solely to manufacture green;
6. evidence is tied to the final candidate SHA;
7. residual risk and rollback are documented;
8. P0/P1 fixes receive independent review before merge.

## 11. Non-goals

This audit will not:

- attack production;
- brute-force accounts;
- probe other users' or tenants' data;
- spend paid provider quota;
- execute destructive database actions;
- claim SENIAT, PCI, HIPAA or other legal/regulatory compliance;
- equate missing best practice with a vulnerability without a demonstrated boundary/result;
- rewrite unrelated application architecture during the audit itself.

## 12. Rollout phases

### Phase A — Integration

Pin Cloudflare source, add wrapper, verify skill provenance and policy precedence.

### Phase B — Reconnaissance

Map architecture, trust boundaries, entry points, data stores, messaging, providers, CI/deployment and sensitive resources.

### Phase C — Coverage & hunting

Build ledger and run deep domain passes, prioritizing auth/tenant/data/financial/remote-control/AI boundaries.

### Phase D — Candidate validation

Validate candidates using source and safe local evidence; downgrade unresolved external facts to `NEEDS_VALIDATION`.

### Phase E — Reporting

Generate normalized artifacts and deduplicate by root cause/fingerprint.

### Phase F — GitHub backlog

Create EPIC and ordered `1/N → N/N` issues with acceptance criteria and implementation dependencies.

### Phase G — Remediation loop

Implement issues one at a time, with exact-SHA validation and no automatic merge unless the owner explicitly authorizes that merge in the same turn.

## 13. Key risks and mitigations

- **External-skill supply-chain risk:** exact SHA + license + vendored hashes + no upstream script execution.
- **False positives:** boundary/result requirement and separate `NEEDS_VALIDATION` state.
- **False sense of completeness:** deterministic coverage ledger and explicit gaps/deferred units.
- **Unsafe validation:** source-first review; no production/live-provider probing.
- **Issue explosion:** deduplicate by root cause before generating backlog.
- **Security vs accounting conflict:** project accounting and tenant invariants outrank external recommendations.
- **Autonomous WhatsApp regression:** existing financial/stateful authority gates remain unchanged throughout audit integration.

## 14. Definition of done for this initiative

The initiative is complete when the pinned skill integration is verified, the deep audit has an exact-SHA coverage ledger, every candidate is either independently confirmed/rejected or explicitly blocked as `NEEDS_VALIDATION`, reports are normalized, the GitHub EPIC exists, actionable findings are numbered `1/N → N/N`, and the repository has a clear remediation order without weakening existing ContaGest safety contracts.
