# Vertical Asset System — 70/75

## Decision

ContaGest has one explicit asset boundary for product verticals and critical shell visuals.

- Semantic vertical illustrations are declared only in `frontend/src/assets/verticalAssets.js`.
- Public illustration files live under `frontend/public/vertical-assets/`.
- Critical fonts and Font Awesome Free are self-hosted under `frontend/public/vendor/` with upstream license texts retained.
- Shared empty states consume the catalog instead of hardcoded per-view paths.
- The canonical visual system CSS remains `frontend/src/styles/contagest-visual-system-v12.css`; 70/75 does not create a second styling authority.
- The PWA service worker precaches the critical local font/icon resources and semantic vertical illustrations.

## Covered surfaces

Veterinaria, Odontología, Psicología, Gimnasio, Nutrición, login and PWA shortcuts/offline shell.

## Security and reliability

SVG assets must have a `viewBox`, contain no script and reference no remote resources. The private shell must not require Google Fonts, Google Fonts static hosts or cdnjs to render critical typography/iconography.

The fail-closed gate is `npm run audit:vertical-assets`, backed by `tests/vertical_asset_system_70_75.test.mjs`.
