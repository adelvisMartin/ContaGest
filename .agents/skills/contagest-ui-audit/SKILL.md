---
name: contagest-ui-audit
description: Senior ERP UI/UX and design-system audit using pinned Impeccable, Taste and motion references.
---

# ContaGest UI Audit

Use `impeccable` for systematic critique/typography/contrast/spacing/responsive/hardening commands. Use `taste` only to challenge generic template output and improve visual specificity; never copy another product's brand or treat Taste guidance as a requirement.

## ERP-specific review
- Information density must match the role: accountant, seller, clinic, gym and platform admin should not receive the same visual priority.
- Preserve numeric alignment, scanability, table headers, sticky context and clear VES/USD currency labeling.
- Dark surfaces require semantic light text tokens with sufficient contrast; do not rely on opacity that makes labels unreadable.
- Typography needs an intentional scale for page title, section title, field label, body, helper and dense table metadata.
- Spacing must be tokenized and consistent across cards, forms, dialogs and data tables.
- Every control needs hover/focus/disabled/error/loading/success states.
- Mobile targets must work at narrow widths without horizontal overflow, clipped actions or hidden required context.
- The design system must favor reusable semantic tokens over one-off hex values.

## Anti-template standard
Before adding visual decoration, identify what makes the workflow/domain specific. Prefer useful account/tenant context, meaningful status, tailored empty states and strong information hierarchy over gradients, oversized marketing copy or gratuitous glass effects.
