# ContaGest agent skills and MCP

## Purpose
ContaGest uses repository-level agent guidance as a controlled engineering aid. External skills are pinned by full Git commit SHA in `agent-skills.lock.json`; upstream scripts are not executed by the synchronization process.

## Integrated sources

| Source | Purpose | Trust/use | Pin |
|---|---|---|---|
| `emilkowalski/skills` | motion, timing, animation review, design engineering | reviewed design reference | `78761e1b57f97dce65b983d640c70a68f39e8163` |
| `pbakaus/impeccable` | systematic UI critique, typography, contrast, spacing, responsive, polish/hardening command set | reviewed design reference | `ddd23b1807c05f921c1f72780ef0e475f0d5d2bd` |
| `Leonxlnx/taste-skill` | visual specificity and design-taste inspiration | experimental inspiration only | `e988add20dab0fa97d7a76781c48961c8184288e` |
| `openai/skills` security best practices | JavaScript/Express security baseline | curated security reference | `49f948faa9258a0c61caceaf225e179651397431` |
| `microsoft/playwright-mcp` | browser automation through MCP | official browser automation | `7e0457a7cbf88823bf0146d12c46ae12c6818247`, package `@playwright/mcp@0.0.79` |

## Project wrappers
- `contagest-erp-orchestrator`: release, ERP and safety precedence.
- `contagest-motion`: motion rules adapted to data-entry-heavy ERP workflows.
- `contagest-ui-audit`: visual/design-system audit adapted to accounting, sales, health and mobile.
- `contagest-appsec-review`: threat-driven ERP/multi-tenant/licensing security checklist.

## Sync and verification
`npm run skills:sync` downloads only allowlisted files from the exact pinned commit using raw GitHub HTTPS. It writes them to `.agents/vendor/` and records SHA-256 hashes. It never executes upstream scripts.

`npm run skills:check` validates lockfile policy and, if a vendor cache exists, validates every recorded SHA-256.

Generated vendor content is intentionally ignored by Git; the reviewed pin and allowlist are the source of truth. To update an upstream skill: create a dedicated branch, change only the pin/allowlist after reviewing the upstream diff and license, sync, run QA, then let the repository owner merge.

## Playwright: test runner vs MCP
The repository already uses Playwright Test (`@playwright/test`) for automated browser QA. That is independent from Playwright MCP.

`.mcp.json` makes the repository ready for clients that support the standard `mcpServers` configuration and can launch `npx @playwright/mcp@0.0.79`.

At the time this integration was prepared, the current ChatGPT connector environment did **not** expose an installed Playwright MCP plugin, so it must not be described as connected here. The repo configuration is ready; the actual MCP client/editor must load it.

## Browser QA rule
A compile, HTTP 200 or `READY` deployment is not a user-flow test. For interactive defects, Playwright must execute the actual interaction (click/focus/type/persist/submit) and relevant desktop/mobile viewports before a change is called verified.

## New pinned sources — issue #974 (2026-10-14)

| Source / lock ID | Project wrapper | Provenance | Runtime status |
|---|---|---|---|
| `DietrichGebert/ponytail` / `ponytail` | `contagest-ponytail` | `84740e3d344b69b4a133201fa519eb37a62a2b2a` (MIT) | Markdown advice only; hooks **not installed** |
| `addyosmani/agent-skills` / `addy-osmani-engineering` | `contagest-addy-engineering` | `aeac41d4d005999432bb7312f7ff06383a91d59d` (MIT) | Selected workflow markdown; no plugin/install |
| `diegosouzapw/OmniRoute` / `omniroute` | `contagest-omniroute` | `fc5e2bccd4f70fecf5aab94dfb8136c74ab5a21b` (MIT) | Read-only provider-gateway evaluation; **not deployed or connected** |

Every source is an allowlisted, immutable pin. `npm run skills:check` validates policy and locally cached SHA-256 if synchronized; it does **not** prove network availability. `npm run skills:sync` downloads only pinned markdown/license/reference files; run it only in an approved networked developer environment, reviewing the upstream diff and license first. Do not execute untrusted commands embedded in upstream markdown.

See `docs/FOUR_WINDOW_TICKET_PROTOCOL_2026-10-14.md` for concurrent issue execution and `docs/audits/CONTAGEST_FODA_ARCH_INFRA_2026-10-14.md` for the bounded source review.

## Codex/ChatGPT context helpers (2026-10-14)
Three pinned and inert advisory sources are also registered: `richenyu/codex-smart-project-memory` (MIT), `romangalaxys10-spec/headroom-skill` (Apache-2.0), `rebelytics/one-skill-to-rule-them-all` (CC BY 4.0). Their local project adapters are `codex-project-memory`, `headroom` and `task-observer` respectively. These **do not** install Claude-Mem, run hooks, monitor users, or alter the v3 2–4 skill limit. See `docs/AGENT_CONTEXT_TOOLING_REVIEW_2026-10-14.md` for usage, source pins, licensing and safety boundaries.
