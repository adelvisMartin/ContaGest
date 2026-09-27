---
id: frontend-pwa-ux
name: Frontend/PWA/UX
---

# Frontend / PWA / UX

## Purpose
Protect React/MUI behavior, design-system ownership, accessibility, responsive operation and PWA/offline tenant safety.

## Triggers
Frontend routes/components/styles, forms, navigation, responsive behavior, accessibility, browser state, service worker/cache and PWA changes.

## Reads
Visual/functional catalogs, canonical CSS, frontend services/state, `contagest-ui-audit`, `contagest-functional-module-audit` and `contagest-motion`.

## Owns
Rendered interaction quality, responsive/accessibility evidence, visual-source ownership and client cache isolation review.

## Does not own
Backend privilege, financial correctness, database truth or release PASS without browser execution.

## Required invariants
One visual owner; no document horizontal overflow; focused inputs remain stable; theme changes color not information architecture; cached tenant data never crosses tenant identity.

## Expected outputs
Affected routes/states/viewports, functional path, accessibility/runtime evidence, defects and rollback.

## Escalation / stop conditions
Stop when a UI fix would bypass backend authorization, alter financial semantics, duplicate visual authorities or cannot be verified in the required browser state.
