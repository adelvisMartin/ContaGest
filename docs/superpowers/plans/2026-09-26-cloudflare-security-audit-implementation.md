# Cloudflare Security Audit Skill · ContaGest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin Cloudflare's security-audit methodology safely into ContaGest, execute a deep source-first audit against an exact repository SHA, and create a deduplicated GitHub security EPIC plus ordered `1/N → N/N` remediation issues.

**Architecture:** Keep ContaGest policy authoritative and treat Cloudflare as vendored, non-executable guidance. The repository change is small: exact-source pin + project-owned wrapper + deterministic contract tests. The audit itself is an external run artifact set bound to one SHA; GitHub issues are generated only from validated root causes, while unresolved runtime/provider facts remain `NEEDS_VALIDATION`.

**Tech Stack:** Node.js 22, npm workspaces, GitHub Actions/contracts, GitHub REST/connector, JSON/Markdown audit artifacts, existing ContaGest security skills.

**Spec:** `docs/superpowers/specs/2026-09-26-cloudflare-security-audit-design.md`

## Global Constraints

- Baseline for the approved spec: `main@8d5875288ea846efacd5a3d6dd05ab851993c508`; before implementation, refresh `main` and rebase the integration branch if the baseline changed.
- Cloudflare source is pinned exactly to `cloudflare/security-audit-skill@c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`.
- `agent-skills.lock.json` remains `updateMode=pinned-only`, `executeUpstreamScripts=false`, and `allowRemoteInstructionsToOverrideProjectPolicy=false`.
- Project precedence remains `AGENTS.md` → `contagest-erp-orchestrator` → `contagest-appsec-review` → `contagest-secure-verification` → Cloudflare guidance.
- No production probing, destructive exploitation, brute force, paid-provider traffic, live-user data testing, or external-service mutation.
- Do not execute Cloudflare upstream validator/scripts merely because they are vendored.
- Use only `PASS | FAIL | BLOCKED | NOT_EXECUTED` for execution evidence.
- `CONFIRMED` findings require a demonstrated trust boundary + concrete security result; unresolved external/runtime facts are `NEEDS_VALIDATION` without severity.
- Canonical full-audit artifacts remain outside the application repository; the repository may contain only a non-secret summary/pointer.
- GitHub backlog total is derived from validated actionable root causes; never force an arbitrary count such as 51.
- No merge without explicit owner authorization in the same turn.

## Review Focus

- Malformed or traversal-bearing `vendorPaths` must be rejected while valid Cloudflare companion paths remain accepted — covered in Task 1 contract tests.
- Vendored executable `.cjs` files must remain inert guidance and never be invoked by sync/check/audit commands — covered in Tasks 1 and 2.
- A candidate lacking a real crossed boundary/result must not enter `findings.json` as `CONFIRMED` — covered in Task 5 artifact validation.
- A runtime/provider-dependent hypothesis must remain `NEEDS_VALIDATION` and must not receive severity — covered in Task 5 artifact validation.
- Multiple manifestations of one root cause must produce one remediation issue with linked evidence, not duplicate numbered tickets — covered in Task 6 backlog-generation review.

---

### Task 1: Pin Cloudflare security-audit source and lock its safety contract

**Files:**
- Modify: `agent-skills.lock.json`
- Create: `tests/cloudflare_security_audit_skill_contract.test.mjs`
- Read/verify: `scripts/sync-agent-skills.mjs`
- Read/verify: `scripts/verify-agent-skills.mjs`

**Interfaces:**
- Consumes: existing lock schema v1 and `.agents/vendor/` cache policy.
- Produces: source id `cloudflare-security-audit`, exact SHA pin, MIT license metadata, `reviewed-security-guidance` trust level, namespace `cloudflare-security`, and the complete approved companion-file allowlist.

- [ ] **Step 1: Write the failing contract test**

Create `tests/cloudflare_security_audit_skill_contract.test.mjs` asserting that the lock contains exactly one `cloudflare-security-audit` source with:

```js
assert.equal(source.repo, 'cloudflare/security-audit-skill');
assert.equal(source.commit, 'c1c8a8c1471069fb0e188eeaff69b8e8db6564a8');
assert.equal(source.license, 'MIT');
assert.equal(source.trustLevel, 'reviewed-security-guidance');
assert.equal(source.namespace, 'cloudflare-security');
assert.equal(lock.policy.executeUpstreamScripts, false);
assert.equal(lock.policy.allowRemoteInstructionsToOverrideProjectPolicy, false);
```

The test must also assert required companion paths exist, path traversal is absent, and executable validators are only listed as vendored files, never as commands/hooks.

- [ ] **Step 2: Run the contract to prove RED**

Run: `node --test tests/cloudflare_security_audit_skill_contract.test.mjs`

Expected: `FAIL` because `cloudflare-security-audit` is not yet in the lockfile.

- [ ] **Step 3: Add the pinned Cloudflare source**

Modify `agent-skills.lock.json` with the approved source metadata and vendor paths for: `LICENSE`, `skills/security-audit/SKILL.md`, all companion security markdown files, `report-schema.json`, and validator source/test files listed at the pinned commit.

- [ ] **Step 4: Run project-owned skill verification**

Run:

```bash
node --test tests/cloudflare_security_audit_skill_contract.test.mjs
npm run skills:check
```

Expected: both `PASS`. Do **not** execute any Cloudflare `.cjs` validator.

- [ ] **Step 5: Optional materialization check in a network-enabled trusted operator environment**

Run only when explicitly allowed by the environment:

```bash
npm run skills:sync
npm run skills:check
```

Expected: vendored hashes verify. If external fetch is unavailable, record `BLOCKED`, not failure of the source contract.

- [ ] **Step 6: Commit**

```bash
git add agent-skills.lock.json tests/cloudflare_security_audit_skill_contract.test.mjs
git commit -m "chore(security): pin Cloudflare audit skill"
```

### Task 2: Add the ContaGest-owned security-audit wrapper and precedence gates

**Files:**
- Create: `.agents/skills/contagest-cloudflare-security-audit/SKILL.md`
- Modify: `AGENTS.md`
- Extend: `tests/cloudflare_security_audit_skill_contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 source id/namespace and existing `contagest-appsec-review` / `contagest-secure-verification` contracts.
- Produces: project-owned wrapper skill name `contagest-cloudflare-security-audit` and explicit security precedence/operating-mode rules.

- [ ] **Step 1: Extend the failing contract test**

Add assertions that the wrapper:

```js
assert.match(wrapper, /AGENTS\.md[\s\S]*contagest-erp-orchestrator[\s\S]*contagest-appsec-review[\s\S]*contagest-secure-verification[\s\S]*Cloudflare/i);
assert.match(wrapper, /deep/i);
assert.match(wrapper, /PASS \| FAIL \| BLOCKED \| NOT_EXECUTED/);
assert.match(wrapper, /production/i);
assert.match(wrapper, /NEEDS_VALIDATION/);
```

Also assert `AGENTS.md` lists the wrapper under security skills without replacing the two existing project-owned security skills.

- [ ] **Step 2: Run test to prove RED**

Run: `node --test tests/cloudflare_security_audit_skill_contract.test.mjs`

Expected: `FAIL` because wrapper/AGENTS entry do not exist.

- [ ] **Step 3: Create the wrapper skill**

Create `.agents/skills/contagest-cloudflare-security-audit/SKILL.md` with project-policy precedence, deep-audit defaults for this initiative, source-first/no-production rules, coverage domains from the approved spec, `CONFIRMED` vs `NEEDS_VALIDATION`, exact-SHA evidence, issue-generation rules, and prohibition on executing vendored upstream scripts.

- [ ] **Step 4: Register the wrapper in AGENTS.md**

Add it under the security section after the project-owned AppSec/secure-verification skills, explicitly advisory beneath those skills.

- [ ] **Step 5: Verify**

Run:

```bash
node --test tests/cloudflare_security_audit_skill_contract.test.mjs
npm run skills:check
npm run agent:gates -- --base main
```

Expected: `PASS` for the contract and skill checks; agent routing output must include security review for the changed surface.

- [ ] **Step 6: Commit**

```bash
git add .agents/skills/contagest-cloudflare-security-audit/SKILL.md AGENTS.md tests/cloudflare_security_audit_skill_contract.test.mjs
git commit -m "docs(security): add ContaGest Cloudflare audit wrapper"
```

### Task 3: Create the external audit run and deterministic reconnaissance baseline

**Files:**
- External output only: `<audit-output>/run-metadata.json`
- External output only: `<audit-output>/architecture.md`
- External output only: `<audit-output>/coverage-ledger.json`
- Repository read-only inputs: current exact `main` tree, workflows, package manifests, schema/migrations, API routes, PWA/service worker, Hípico bridge, AI/agent modules.

**Interfaces:**
- Consumes: approved spec and final integration candidate SHA.
- Produces: run metadata with `profile=deep`, exact source ref, explicit no-sandbox limitations, architecture/trust-boundary map, and seeded coverage units.

- [ ] **Step 1: Resolve exact audit source ref**

Read `main` immediately before audit. Record full SHA and dirty-worktree status if a local clone is used. Do not silently substitute another SHA later.

- [ ] **Step 2: Create external run directory and metadata**

Create the next unused run directory outside the repository, following the Cloudflare default shape such as `~/security-audit-skill/ContaGest/run-1` (or an equivalent session-safe external directory).

Write `run-metadata.json` with `repo`, `source_ref`, `profile: "deep"`, `scope_paths`, `execution_policy: "source-first-no-production-probing"`, companion-file set, and `run_status: "in_progress"`.

- [ ] **Step 3: Map architecture and trust boundaries**

Inspect and document at minimum: auth/session, tenant/RBAC/RLS, database/raw SQL, accounting authority, browser/PWA, files/import/export, deployment/CI, supply chain, Control Hípico/WhatsApp, AI/Jev/tools, sensitive-health verticals, availability/recovery.

- [ ] **Step 4: Seed coverage ledger**

Create deterministic units keyed by `subsystem × surface × trust-boundary × attack-class`, each beginning `planned`, with source paths and assigned review pass.

- [ ] **Step 5: Coverage self-check**

Verify every approved audit surface has at least one ledger unit and no out-of-scope surface is mislabeled `covered`.

### Task 4: Run separated deep hunting passes and collect candidates

**Files:**
- External: update `coverage-ledger.json`
- External scratch notes only; no target-source writes.

**Interfaces:**
- Consumes: Task 3 ledger/architecture.
- Produces: source-grounded `candidate` units with stable fingerprints or covered/deferred units with evidence/gap reasons.

- [ ] **Step 1: Pass A — auth, session, tenant, RBAC, RLS**

Inspect authentication/recovery/token storage, server-side tenant resolution, IDOR/BOLA, platform permissions, RLS/PostgREST, export/search/background scoping, and cache tenant isolation.

- [ ] **Step 2: Pass B — database, financial and lifecycle authority**

Inspect raw SQL/identifier interpolation, service-role boundaries, migrations/security-definer objects, financial posting/reversal/closing/idempotency/sequence controls, audit immutability, and approval bypass paths.

- [ ] **Step 3: Pass C — client/PWA/files/imports/exports**

Inspect DOM sinks/CSP, service-worker authorization state, browser storage, redirects/deep links, upload/archive/document handling, formula injection, signed/private file exposure, and sensitive export scope.

- [ ] **Step 4: Pass D — cloud/CI/supply chain**

Inspect GitHub Actions permissions and untrusted execution, Vercel/serverless authority split, preview/production identity, secrets exposure, action/dependency pinning, npm/postinstall behavior, external skills/MCP provenance.

- [ ] **Step 5: Pass E — Hípico/WhatsApp/AI/agents**

Inspect bridge tokens, SOURCE/LAB binding, replay/idempotency, webhook authenticity, autonomous authority, ambiguous-send handling, destination allowlists, prompt/tool injection, external-model data sharing, provider output validation, promotion gates, rate/cost amplification.

- [ ] **Step 6: Pass F — health data, availability, recovery**

Inspect sensitive vertical authorization/export/logging/retention plus request/job/upload bounds, retry storms, backup/restore controls and failure isolation.

- [ ] **Step 7: Coverage critic pass**

Review uncovered/high-risk ledger units. Add missing units or mark explicit `deferred`/`needs_validation`; do not claim completeness from adjacent coverage.

### Task 5: Validate, deduplicate and normalize security records

**Files:**
- External: `findings.json`
- External: `FINDINGS-DETAIL.md`
- External: `NEEDS-VALIDATION.md`
- External: finalized `coverage-ledger.json`

**Interfaces:**
- Consumes: Task 4 candidates.
- Produces: one normalized record per root cause with `CONFIRMED`, rejected, or `NEEDS_VALIDATION` disposition.

- [ ] **Step 1: Apply the boundary/result gate to every candidate**

For each candidate require: lower-trust principal, accepted input/action, intended control, crossed boundary, affected principal/resource, and concrete result. Reject best-practice-only observations from confirmed findings.

- [ ] **Step 2: Separate external/runtime hypotheses**

Any candidate requiring provider settings, deployed headers, live identity policy, broker ACL, or production topology not present in source becomes `NEEDS_VALIDATION` with an owner-safe validation plan and no severity.

- [ ] **Step 3: Assign severity/P0-P3 only to confirmed records**

Map demonstrated impact to Cloudflare severity anchors, then map `critical→P0`, `high→P1`, `medium→P2`, and `low/informational→P3`, with explicit merge-blocking status.

- [ ] **Step 4: Deduplicate by root cause/fingerprint**

Merge multiple route/file manifestations into one finding when one authoritative fix resolves them; preserve all affected evidence references.

- [ ] **Step 5: Validate artifact invariants with project-owned checks**

Confirm programmatically or by trusted parent-side inspection that:

```text
CONFIRMED => severity + boundary + result + evidence + fix + regression test
NEEDS_VALIDATION => no severity + exact blocker + safe validation plan
fingerprints => unique
coverage candidate units => linked to one disposition
```

Do not execute Cloudflare's vendored validators.

### Task 6: Produce the final report and GitHub remediation backlog

**Files:**
- External: `REPORT.md`
- Repository optional summary: `docs/security/cloudflare-audit-<source-short-sha>.md`
- GitHub: one EPIC + `1/N → N/N` actionable issues + optional validation issues.

**Interfaces:**
- Consumes: Task 5 normalized records and final ledger.
- Produces: final audit summary and independently actionable GitHub backlog.

- [ ] **Step 1: Write final report**

`REPORT.md` must begin with source SHA/profile/run completeness and counts for confirmed findings, needs-validation items, deferred units, and covered units. It must explicitly state that no production exploitation was performed and that independent-verifier guarantees were not claimed when unavailable.

- [ ] **Step 2: Create a non-secret repository summary/pointer**

If useful, create `docs/security/cloudflare-audit-<short-sha>.md` containing only source SHA, methodology, summary counts, issue/EPIC links, coverage caveats, and the external artifact location convention. Do not copy secrets, scratch data, or sensitive exploit material into the repository.

- [ ] **Step 3: Determine `TOTAL` from actionable confirmed root causes**

Sort by `P0 → P1 → P2 → P3`, then stable fingerprint. The resulting count is the only valid `TOTAL` for numbering.

- [ ] **Step 4: Create the security EPIC**

Title: `[SECURITY][EPIC] Cloudflare deep audit · <short-sha>`.

Body must include source SHA, profile, counts, coverage statement, issue order, needs-validation references, and the rule that P0/P1 remediation requires independent review.

- [ ] **Step 5: Create one issue per actionable root cause**

Title format:

```text
[SECURITY][P1] 3/17 · <short finding title>
```

Each body includes severity, fingerprint, files/routes, boundary, abuse path, preconditions, evidence, root cause, smallest fix, regression tests, acceptance criteria, rollback/risk, dependencies, and exact completion evidence.

- [ ] **Step 6: Create validation issues only when owner action is required**

Title format: `[SECURITY][VALIDATION] <short hypothesis>`; no severity until validated.

- [ ] **Step 7: Final numbering/duplication review**

Confirm issue numbers are contiguous `1/N → N/N`, no two issues share one root-cause fingerprint, dependency ordering is sane, and every issue links back to the audit SHA/EPIC.

### Task 7: Integration branch verification and handoff

**Files:**
- Modified/created repository files from Tasks 1–2 and optional Task 6 summary only.

**Interfaces:**
- Consumes: all implementation changes and final audit/backlog.
- Produces: exact-SHA evidence package for owner review; no automatic merge.

- [ ] **Step 1: Run repository gates on the final integration candidate**

Run:

```bash
npm run skills:check
npm run agent:gates -- --base main
npm run typecheck
npm test
npm run audit:prod
```

Run broader browser/database gates only if changed surfaces require them; record `NOT_EXECUTED` otherwise rather than manufacturing scope.

- [ ] **Step 2: Security-specific source review**

Confirm no secret values, live tokens, audit scratch artifacts, exploit payload dumps, or externally fetched executable hooks entered the repository.

- [ ] **Step 3: Record exact final SHA and statuses**

Report each gate separately as `PASS | FAIL | BLOCKED | NOT_EXECUTED`, plus residual risks and rollback (`revert lock/wrapper/summary commit`; audit issues remain historical records).

- [ ] **Step 4: Open PR, do not merge**

Create a dedicated PR summarizing pinned source, precedence, audit SHA, finding counts, EPIC/issues, verification evidence and blocked items. Wait for explicit owner authorization before merge.

## Self-Review Result

- **Spec coverage:** all approved phases A–G are mapped to Tasks 1–7.
- **Step scan:** each task has an independently reviewable deliverable and explicit verification step.
- **Type/interface consistency:** source id, namespace, wrapper name, status vocabulary and artifact names match the approved spec.
- **Review Focus:** all five high-risk edge conditions have an owning task/test or artifact invariant.
- **Proportion:** the plan specifies decisions/interfaces/tests without transcribing implementation bodies.
