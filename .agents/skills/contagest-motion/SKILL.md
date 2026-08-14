---
name: contagest-motion
description: Applies deliberate motion, timing and transitions to ContaGest without harming ERP productivity or accessibility.
---

# ContaGest Motion

Reference the pinned `emil-motion` source in `agent-skills.lock.json` and use Impeccable's motion review only after behavior is stable.

## Motion principles
- Motion must explain hierarchy, state change, causality or spatial relationship; never animate merely to decorate every surface.
- Prefer transform/opacity for UI motion. Avoid layout-thrashing animation on dense tables and dashboards.
- Keep high-frequency ERP actions fast. Suggested project ranges: micro feedback 120-180ms, common transitions 180-260ms, deliberate reveal 260-400ms. These are guidelines, not a reason to delay task completion.
- Use consistent easing families and direction. Enter/exit pairs must feel related.
- Never move or remount a focused input because exchange rates, analytics, timers, CAPTCHA or background state changed.
- Never attach global click/pointer handlers that cancel native form-control behavior.
- Honor `prefers-reduced-motion: reduce`; core workflows must remain understandable with motion disabled.
- Avoid auto-playing decorative motion in accounting entry, checkout, login, medical or destructive-confirmation flows.

## QA gate
For every motion change verify: keyboard navigation, reduced motion, no focus loss, no cumulative layout shift that impedes data entry, mobile performance, and no duplicate submissions during transitions.
