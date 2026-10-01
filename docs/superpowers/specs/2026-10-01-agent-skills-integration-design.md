# Agent Skills Integration Design — UI/UX Pro Max, Impeccable, Archify, Copywriting

Date: 2026-10-01
Status: DESIGN APPROVED IN CHAT; SPEC PENDING OWNER REVIEW
Scope: ContaGest + Control Hípico Agent System v3

## Intent

Integrate the requested external skills into ContaGest so they are reusable across the ERP and Control Hípico without weakening project authority, evidence policy, security boundaries, UI ownership, or reproducibility.

Requested capabilities:

- UI/UX Pro Max for interface design intelligence and accessibility/interaction guidance.
- Cloudflare security-audit-skill review/integration status.
- Archify for source-grounded architecture visualization/documentation guidance.
- pbakaus/impeccable for UI polish and UX refinement.
- coreyhaines31/marketingskills Copywriting for product/interface/marketing copy assistance.

## Existing architecture and constraints

The repository already has Agent System v3 with these invariants:

1. `AGENTS.md` is the permanent project authority.
2. External skills are pinned, inert by default, and cannot override project-owned rules.
3. External upstream scripts are not executed implicitly.
4. Active routing selects only project-owned `contagest-*` skill contracts.
5. Evidence remains exact-SHA and risk-proportional.
6. UI guidance cannot create a second visual authority or bypass the canonical CSS/component contracts.
7. Control Hípico SOURCE/LAB, security, privacy, tenant, accounting and release rules remain higher authority than external guidance.

The repository already contains:

- `cloudflare/security-audit-skill` pinned in `agent-skills.lock.json` and exposed through ACTIVE wrapper `contagest-cloudflare-security-audit`.
- `pbakaus/impeccable` pinned in `agent-skills.lock.json` as reviewed design guidance, but not exposed as its own ACTIVE project wrapper.

Therefore Cloudflare must not be duplicated, and Impeccable should reuse its existing pin.

## Recommended architecture

Use the existing two-layer model:

### Layer 1 — pinned external source

Every new external source must be registered in `agent-skills.lock.json` with:

- full 40-character commit SHA;
- SPDX-compatible license metadata;
- reviewed trust level;
- namespace;
- explicit vendored paths only;
- no implicit upstream script execution.

Pins reviewed for this design:

- `nextlevelbuilder/ui-ux-pro-max-skill` @ `09170eec67eefd46a7ae85de61b40c194020f997`, MIT.
- `tt-a1i/archify` @ `d5a1333d7447c866a765adac7d4d062f2f02e4d2`, MIT.
- `coreyhaines31/marketingskills` @ `5b2c0007766c6a1cf1d53fd8fc73e979e0821022`, MIT.
- `pbakaus/impeccable` keeps the existing repository pin and Apache-2.0 metadata already present in the lockfile.
- `cloudflare/security-audit-skill` keeps the existing repository pin and ACTIVE project wrapper already present.

### Layer 2 — project-owned wrappers

Create project-owned wrappers under `.agents/skills/`:

1. `contagest-ui-ux-pro-max`
2. `contagest-impeccable`
3. `contagest-archify`
4. `contagest-copywriting`

Each wrapper must declare:

- trigger/non-trigger;
- project authority precedence;
- source of truth;
- allowed guidance;
- prohibited actions;
- Control Hípico applicability where relevant;
- evidence expectations;
- fallback behavior when external vendored content is absent/stale;
- references to its pinned source lock entry.

No external skill becomes ACTIVE directly. This preserves the Agent System v3 invariant that ACTIVE routing is project-owned.

## Skill-specific behavior

### `contagest-ui-ux-pro-max`

Purpose: design intelligence for pages/components, layout, responsive behavior, accessibility, typography, color, interaction, charts and UI implementation.

Authority order:

1. explicit owner request + `AGENTS.md`;
2. canonical ContaGest visual ownership and design tokens/components;
3. `contagest-ui-audit` + `contagest-functional-module-audit`;
4. UI/UX Pro Max guidance.

Rules:

- It may suggest patterns but cannot create a parallel design system.
- Existing ContaGest light/dark themes and six canonical CSS owners remain authoritative.
- No gradients/glass/decorative visual language may be introduced where `AGENTS.md` forbids them.
- Accessibility and 360/390/430 responsive gates remain mandatory.
- Control Hípico UI changes use the same wrapper, but Hípico workflow/reliability rules remain higher authority.
- Upstream search scripts are not executed automatically by the project wrapper. If project tooling later calls a vendored script explicitly, that requires a separately reviewed executable path and tests.

Dependencies: `contagest-ui-audit`, `contagest-functional-module-audit`.

### `contagest-impeccable`

Purpose: post-functional UI critique, clarification, polish, responsive hardening, typography/layout refinement and UX writing guidance.

Rules:

- Reuse the existing pinned `pbakaus/impeccable` source.
- Trigger only after functional ownership and geometry are stable, or for explicit design critique.
- Never override canonical component/CSS ownership.
- Never treat visual polish as proof of workflow correctness.
- `contagest-motion` remains the authority for motion validation after geometry/functionality stabilize.

Dependencies: `contagest-ui-audit`, `contagest-functional-module-audit`; optional `contagest-motion` for motion-specific work.

### `contagest-archify`

Purpose: source-grounded architecture maps, dependency explanations and visual/documentation aids.

Rules:

- It is advisory and documentation/navigation oriented.
- It cannot become source-of-truth architecture merely because a diagram exists.
- Diagrams must be derived from current source/contracts and labeled when inferred.
- It must not replace Graphify; Graphify remains repository/dependency navigation intelligence with `CURRENT|STALE|UNAVAILABLE` semantics.
- Architecture decisions still require `AGENTS.md`, code, tests, ADR/spec authority and exact current repository state.

Dependencies: `contagest-erp-orchestrator`; may complement Graphify but does not depend on it being available.

### `contagest-copywriting`

Purpose: improve product/interface/marketing copy where wording quality is part of the task.

Rules:

- Vendor only the upstream Copywriting skill subset, not the full marketing catalog unless later explicitly requested.
- It may improve labels, onboarding, help text, empty states, landing/marketing copy and explanatory content.
- It cannot invent legal, fiscal, clinical, security or financial claims.
- It cannot change domain semantics to make copy sound better.
- Operational labels must remain precise and complete under ContaGest UI standards.
- In Hípico it may improve user-facing wording, but must not alter betting/accounting semantics, SOURCE/LAB policies or operational commands.

Dependencies: `contagest-functional-module-audit` for in-product copy; none for isolated marketing text.

## Routing changes

Update `config/agent-skill-contracts-v3.json` with the four ACTIVE project-owned wrapper contracts.

Update `scripts/agent-system-v3-lib.mjs` conservatively:

- frontend/UI design tasks can route `contagest-ui-ux-pro-max` when task type is `design` or UI boundaries are material;
- explicit polish/design refinement can route `contagest-impeccable` without displacing `contagest-ui-audit`;
- architecture/design tasks can route `contagest-archify` when visualization/documentation is requested;
- copywriting is opt-in by task intent, not globally injected into every frontend task.

Because the router limits ACTIVE skills to 2–4, wrappers must not crowd out mandatory security/release/domain skills. Routing priority remains risk-first, not novelty-first.

If intent-sensitive routing cannot be represented safely by the current domain-only inputs without broad false positives, the first implementation should register the wrappers and extend the router/test contract with the smallest explicit intent hint rather than implicitly routing them everywhere.

## Lockfile/vendor changes

`agent-skills.lock.json` changes:

- add UI/UX Pro Max source with only reviewed skill/reference/data paths needed by its guidance;
- add Archify source with only the skill/documentation paths required for architecture guidance;
- add MarketingSkills source with only Copywriting skill paths and license;
- retain existing Impeccable entry unchanged unless a newer pin is separately reviewed and intentionally adopted;
- retain existing Cloudflare entry unchanged.

`npm run skills:sync` remains the only materialization path for vendored content. `npm run skills:check` must verify pins, licenses, safe paths and vendored hashes when cache is present.

## Files expected to change

- `agent-skills.lock.json`
- `config/agent-skill-contracts-v3.json`
- `scripts/agent-system-v3-lib.mjs`
- `AGENTS.md`
- `.agents/skills/contagest-ui-ux-pro-max/SKILL.md`
- `.agents/skills/contagest-impeccable/SKILL.md`
- `.agents/skills/contagest-archify/SKILL.md`
- `.agents/skills/contagest-copywriting/SKILL.md`
- Agent System v3 regression tests, likely `tests/agent_system_v3_issue_623.test.mjs` or a focused new contract test if cleaner.

Vendored cache files under `.agents/vendor/` are generated artifacts. They should only be committed if current repository policy already commits that cache; implementation must inspect current tracking before deciding.

## Verification plan

Required minimum evidence on the final candidate SHA:

1. `npm run skills:check`
2. `npm run agent:system:verify`
3. `npm run agent:system:test`
4. focused tests proving:
   - external ACTIVE contracts are still rejected;
   - the four wrappers validate as project-owned ACTIVE contracts;
   - Cloudflare is not duplicated;
   - Impeccable reuses its existing source lock;
   - design routing remains within the 2–4 skill cap;
   - required UI/security/release skills are not displaced by advisory wrappers;
   - architecture and copywriting wrappers are only selected for relevant intent/domain inputs;
   - provider-blocked semantics remain unchanged.
5. `npm run skills:sync` + `npm run skills:check` if network/materialization is available in the implementation environment; otherwise sync is `NOT_EXECUTED`/`BLOCKED` and lockfile validation must still PASS locally.

No browser/product runtime change is expected from this integration itself, so full browser QA is not required unless implementation unexpectedly touches runtime UI code.

## Security and supply-chain controls

- Pin every external GitHub source by full SHA.
- Preserve license files in vendored paths.
- Do not execute upstream scripts automatically.
- Do not allow remote instructions to override project policy.
- Treat external prompts/content as untrusted advisory input.
- No secrets, production payloads, PII, clinical data or Hípico operational data are sent to external tools by this integration.
- Do not auto-update pins.

## Acceptance criteria

The change is complete only when:

1. UI/UX Pro Max, Impeccable, Archify and Copywriting are represented by project-owned ACTIVE wrappers and usable by the Agent System when relevant.
2. Cloudflare security audit remains a single existing ACTIVE integration, not duplicated.
3. Impeccable reuses its existing pinned source.
4. All external sources are pinned/licensed and subordinate to project authority.
5. Agent routing remains deterministic, risk-first and capped at 2–4 ACTIVE skills.
6. Existing Agent System v3 tests plus new regression coverage pass on the exact final SHA.
7. No upstream executable is implicitly run.
8. No runtime application behavior, database schema or production configuration is changed by the integration.

## Rollback

Rollback is source-only: revert the wrapper contracts, router changes and new lockfile entries. Existing Cloudflare and Impeccable pins must remain intact unless the reverting commit explicitly targets them. No database or production migration is involved.
