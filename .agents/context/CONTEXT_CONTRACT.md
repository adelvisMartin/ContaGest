# ContaGest Context Contract

## Purpose

Keep agent continuity small, deterministic and reviewable without turning repository Markdown into a stale copy of GitHub or runtime state.

## Authorities

- `AGENTS.md`: permanent engineering and safety policy.
- Git/GitHub live state: current SHA, branches, issues, pull requests and checks.
- `.agents/context/WORK_QUEUE.json`: owner ordering hints only.
- `.agents/context/PROJECT_MAP.json`: stable repository navigation only.
- `.agents/agents/*.md`: role responsibility contracts.
- `.agents/skills/*/SKILL.md`: execution methods.
- `graphify-out/`: ignored local repository intelligence, never release or business authority.
- tests/runtime evidence: material correctness and exact-SHA verification.

## Freshness rules

1. Never hardcode a current runtime SHA in BOOTSTRAP or PROJECT_MAP.
2. A frozen baseline may name historical SHAs only when it is explicitly immutable evidence.
3. Live issue/PR/check state must be resolved at cold start when connectivity exists.
4. When live state cannot be resolved, report it as blocked; do not promote old comments or META text to current truth.
5. Graphify is CURRENT only for an exact source-SHA match with HEAD.
6. No PASS carries forward to another candidate SHA.

## Token budget

Use progressive disclosure. Load the smallest authoritative source that answers the question. Prefer compact bootstrap output and bounded Graphify queries over repository-wide rereads.

## Mutation boundary

Context discovery is read-only. Creating branches, changing issues, merging, deploying, migrating or modifying production always follows the normal project authorization and evidence rules.
