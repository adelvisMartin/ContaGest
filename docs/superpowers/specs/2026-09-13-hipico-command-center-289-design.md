# Control Hípico Command Center #289 — Production Design

## Objetivo

Consolidar el Command Center de Control Hípico como read-model operacional seguro, accesible y observable para producción, sin reescritura de framework y sin exponer identidad sensible de grupos WhatsApp al navegador.

## Decisión de identidad

El navegador sólo conoce `groupKey`, una clave local validada con `[A-Za-z0-9._:-]{3,120}`. Nunca recibe ni envía `groupId`, JID SOURCE, tokens ni secretos. El backend resuelve internamente la identidad canónica asociada a `groupKey` para lecturas del agente. Si no existe una coincidencia única, el estado del agente es fail-closed: `not_configured` o `unavailable` con motivo explícito; nunca se adivina ni se escoge una coincidencia arbitraria.

## Arquitectura

- `backend/src/modules/hipico/command-center.service.ts` continúa siendo el read-model canónico. Lee System, Database, Bridge, Channel, Providers, Agent, reuniones/carreras, documentos, cola, conflictos y alertas.
- `backend/src/modules/hipico/command-center.routes.ts` expone sólo una lectura autenticada y `Cache-Control: no-store`; acepta `groupKey`, no `groupId` de browser.
- `frontend/api/hipico/command-center.js` sigue siendo BFF/adaptador serverless hacia backend canónico, sin reclasificar ni persistir negocio.
- `frontend/public/hipico-control/assets/js/command-center.js` renderiza estados; no aplica efectos operacionales ni autoridad financiera.
- `frontend/public/hipico-control/assets/js/command-center-shell.js` monta/refresca el read-model usando sólo la clave local del grupo visible.
- `assets/css/app.css` sigue siendo autoridad visual. `mobile-accessibility.css` sólo refuerza touch/reduced-motion. No se crean hojas globales paralelas.
- `docs/hipico/design-system.md` pasa a ser la especificación de diseño; `STYLE-GUIDE.md` queda como guía práctica de implementación.

## Estados de UI

El Command Center representa explícitamente `idle`, `loading`, `success`, `empty`, `error`, `offline`, `stale`, `unavailable`, `not_configured`, `degraded` y `disabled` cuando aplique. Una lectura fallida nunca se muestra como `0`, vacío sano o éxito.

## Seguridad y automatización

- SOURCE continúa read-only desde Command Center.
- LAB es el único contexto apto para QA/simulación.
- Agent/Shadow sólo muestra estado/métricas; la UI no promueve modos ni ejecuta tools.
- Ningún componente concede autoridad financiera.
- Datos live/race/API nunca se cachean indefinidamente por Service Worker.

## Responsive y accesibilidad

Cobertura mínima: 360, 390/393, 430, 768, 1024 y 1440 px, landscape móvil, viewport reducido por teclado y 200% zoom. Scroll vertical natural, sin clipping/overlap ni bloqueo global. Targets críticos >=44 px. WCAG 2.2 AA: focus-visible, navegación por teclado, landmarks/headings, `aria-live`/`role=status`/`aria-busy`, labels y reduced motion. Tema `system/light/dark` sin flash de tema.

## PWA / offline / Android

El shell puede cachear assets estáticos del Command Center, pero no respuestas API ni datos live. Offline con lectura previa muestra `stale`; offline sin lectura previa muestra `offline`. El wrapper Android debe mantener paridad/hash con la PWA, incluyendo assets del Command Center y theme bootstrap.

## Validación

El SHA final debe tener evidencia para contratos de fuente, backend typecheck/tests, browser Playwright en tamaños objetivo, estados de UI, keyboard/focus, theme/reduced-motion, offline/stale/no-cache, manifest/SW/installability y Android parity. Si el runner no ejecuta (`steps=[]`, `runner_id=0`) se clasifica BLOCKED/NOT VERIFIED, nunca PASS.

## No objetivos

No React/MUI, no dashboard decorativo, no nuevo motor de dominio, no autosend SOURCE, no autoridad financiera, no migración general del resto de ContaGest.