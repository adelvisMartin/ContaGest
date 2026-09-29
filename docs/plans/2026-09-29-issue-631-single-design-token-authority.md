# #631 · Single Design Token Authority — implementation plan

**Spec:** GitHub issue #631  
**Baseline:** `main@3295bdeb7add7b0962f549887287606f7448993d`  
**Scope:** frontend visual authority only. No API, auth, RBAC, financial logic, tenant logic or persistence changes.

## Design

Use one versioned JavaScript data module as the semantic design-token authority. It owns semantic color roles, typography, spacing, radius, elevation, focus, interactive state, density/control sizing, layout breakpoints, z-index and motion. Product-specific Hípico brand/accent values remain explicit editorial variants inside the same authority rather than becoming a second token owner.

Adapters consume that authority:

1. **React/MUI:** a dedicated theme adapter imports the canonical module and creates the MUI theme. `muiRuntime.js` delegates to it and no longer owns a palette.
2. **Legacy CSS/kit:** a deterministic generator emits a public CSS adapter exposing the existing `--cg-v-*` contract. The historical token block remains a temporary fallback only; the unlayered generated adapter is the active authority and is tracked for deprecation.
3. **Hípico:** the same generator emits `platform-tokens-v1.css`, loaded after the existing Hípico stylesheet. Shared platform semantics and documented Hípico editorial variants therefore come from the canonical module without moving Hípico to React.
4. **System theme:** the shell preserves `light | dark | system`; system mode resolves through the OS media query while keeping the same semantic token contract.

Generated artifacts are committed for deterministic static/PWA delivery and protected by `--check` plus contract tests so source and generated CSS cannot drift.

## Tasks

### Task 1 — RED contract
- Add `tests/design_token_authority_issue_631.test.mjs`.
- Assert canonical versioned source, category completeness, MUI delegation, generated CSS parity, main/Hípico adapter loading order, light/dark/system/reduced-motion semantics and deprecation ledger.
- Run it before implementation and record the expected failure because the canonical module/artifacts do not exist yet.

### Task 2 — Canonical source + deterministic adapters
- Add `frontend/src/design-system/semanticTokens.v1.js`.
- Add `scripts/generate-design-tokens-v631.mjs` with write and `--check` modes.
- Commit generated ContaGest and Hípico CSS adapters.
- Preserve current effective light/dark values to avoid an unrelated redesign.

### Task 3 — Consumers
- Add `frontend/src/components/muiThemeAdapter.js` and make `muiRuntime.js` delegate theme creation to it.
- Update the JS compatibility token facade comment to point at the new canonical authority.
- Load the ContaGest generated adapter from `frontend/index.html` and the Hípico adapter after `app.css`.
- Preserve system mode in `frontend/src/app.js`; MUI resolves system mode reactively.

### Task 4 — Governance + migration ledger
- Upgrade `scripts/design-system-authority-audit-v6975.mjs` to fail closed on stale generated artifacts, competing MUI palettes, missing adapters or wrong load order.
- Add a versioned migration/deprecation ledger with owner, reason, review date and removal criteria for temporary fallback declarations.
- Add package scripts for generation/checking and include the new contract in visual validation.

### Task 5 — Verification + integration
- RED→GREEN contract test.
- `node --check` all changed JS/MJS.
- generator `--check`.
- relevant visual contracts/audit where executable.
- frontend build + Chromium pilot QA if the environment can execute them; otherwise mark the gate `BLOCKED` and do not call it PASS.
- review compare/diff, inspect final SHA status, create PR, merge only if mandatory gates are satisfied under project policy, then close #631/remove it from the active backlog.

## Interfaces / invariants

- `semanticTokens.v1.js` → generator and MUI adapter must consume the same exported version/object.
- generator → committed CSS must be byte-for-byte deterministic.
- generated ContaGest CSS → preserves existing `--cg-v-*` names used by legacy components.
- generated Hípico CSS → preserves existing `--hc-*` names and current editorial brand variant.
- no component/route/business contract changes.

## Risks and mitigations

- **Stale generated assets:** fail-closed `--check` and contract equality.
- **Cascade regression:** generated ContaGest adapter is unlayered and loaded after other head styles; Hípico adapter is explicitly loaded after `app.css`.
- **System-theme drift:** preserve `data-theme="system"`, media-query handling and MUI OS-mode subscription.
- **Mass rewrite risk:** historical CSS token blocks are not deleted in this ticket; they are temporary documented fallbacks with explicit removal criteria.
- **Hípico identity loss:** only shared platform primitives are shared; wine/gold editorial brand values remain a named Hípico variant in the canonical module.

## Review focus

Check semantic completeness, accidental palette duplication, CSS cascade/order, system-mode behavior, generated-file determinism, PWA/static path correctness, backward compatibility of `--cg-v-*`/`--hc-*`, and that no business/security/data code changed.
