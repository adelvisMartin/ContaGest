# Design System Authority — 69/75

## Decision

ContaGest keeps one canonical component authority at `frontend/src/components/ui/kit.js` and one canonical visual-token authority at `frontend/src/styles/contagest-visual-system-v12.css`.

`frontend/src/components/designSystem.js` and `frontend/src/components/designTokens.js` are compatibility facades only. They may delegate or expose CSS-variable references, but must not become parallel implementations.

## Gate

`npm run audit:design-system-authority` verifies:

- the legacy component facade delegates to the canonical UI kit;
- `ui/index.js` re-exports the canonical kit;
- required shared primitives remain exported;
- the token facade contains no independent hex/RGB/HSL palette;
- every `--cg-v-*` variable referenced by the JS token facade is declared by the canonical CSS authority;
- compatibility-facade intent remains explicit.

The regression is part of the authoritative contract suite. This change intentionally does not redesign product screens or alter runtime behavior.
