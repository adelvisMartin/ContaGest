# Control Hípico UI System v4.1.2 — Hardening y cierre técnico

**Fecha:** 2026-09-29  
**Autoridad:** UI System v4 + amendment v4.1 + este hardening v4.1.2.

## Objetivo

Cerrar la deuda detectada después de v4.1/v4.1.1 sin crear otro design system paralelo. El alcance es presentación, interacción, QA y PWA; no cambia apuestas, saldos, ledger, Supabase, permisos ni reglas de WhatsApp.

## Clean Code y propiedad de iconos

`ui.js` continúa siendo la única autoridad SVG de Control Hípico. El Centro Operativo de WhatsApp ahora renderiza `chat`, `close`, `copy`, `check`, `report` y `back` directamente desde esa autoridad.

Se elimina `icon-normalization-v41.js` y su `MutationObserver`. Ya no existe un segundo paso que observe todo el DOM para reemplazar glyphs después del render. El componente que crea una acción es también responsable de crear su icono, label y estado accesible.

Esto elimina:

- glyphs `✦`, `×`, `⌄` y `✓` usados como iconos de interfaz;
- mutación post-render de botones;
- un observer global innecesario;
- una fuente adicional de carreras visuales y trabajo sobre el DOM.

## Compatibilidad v3 aislada con cascade layer

`ui-system-v3-compat.css` todavía conserva selectores estructurales necesarios por vistas que no han sido reescritas. No se borra de forma destructiva.

En v4.1.2 esa compatibilidad queda dentro de la CSS cascade layer `legacy`. `ui-system-v4.css` y las reglas finales de `app.css` permanecen fuera de esa layer, por lo que la compatibilidad antigua ya no puede ganar la cascada por especificidad accidental.

Regla de migración:

1. nuevos estilos consumen tokens/primitives v4;
2. ningún nuevo componente se añade a `legacy`;
3. cuando un selector v3 quede sin consumidores se elimina con evidencia de cero consumidores;
4. la layer `legacy` se retira únicamente cuando su inventario llegue a cero.

## Modales, dialogs y notificaciones

Control Hípico es una PWA estática y no incorpora React en su shell. Aunque el frontend general de ContaGest dispone de MUI y `react-hot-toast`, importarlos sólo para Hípico produciría dos runtimes y dos autoridades visuales.

La decisión es mantener `ui.js` como autoridad y elevar su presentación al mismo estándar visual:

- backdrop translúcido con blur;
- superficies de modal/dialog con tokens v4, borde y shadow uniformes;
- encabezados y cuerpos con jerarquía compacta;
- modal móvil como bottom sheet;
- focus management y `aria-modal` existentes preservados;
- toasts compactos con icono, título, mensaje, cierre y tono semántico;
- `success`, `warning`, `error` e `info` usan tokens semánticos, no colores ad-hoc;
- `prefers-reduced-motion` desactiva animaciones/transiciones no esenciales.

El native `<dialog>` del Centro Operativo y los modales construidos por `ui.dialog()` comparten el mismo lenguaje visual.

## Densidad e iconografía

- iconografía canónica: 16×16 px;
- control desktop: 36 px;
- control principal excepcional: hasta 38 px;
- touch/coarse pointer: mínimo 44 px;
- icon-only: centrado con grid en ambos ejes;
- acciones destructivas o ambiguas conservan texto visible.

Ayuda y Textos de WhatsApp forman una rail vertical. Nunca comparten coordenadas y el offset se adapta a móvil/safe area.

## Playwright y regresión visual

La suite v4.1 conserva contratos funcionales de full-width, sidebar 224/66, persistencia, navegación colapsada, tema, branding, densidad y touch targets. v4.1.1 mantiene la medición geométrica anti-overlap.

v4.1.2 cambia la evidencia visual de “captura no vacía” a comparación real con `expect(...).toHaveScreenshot(...)`. Los goldens deben generarse únicamente desde Chromium determinista del mismo checkout y revisarse visualmente antes de aceptarlos. Nunca se fabrican snapshots desde código ni se actualizan automáticamente para hacer verde CI.

Si todavía no existe el golden de un viewport/theme, el gate se clasifica como `NOT_EXECUTED / BASELINE_REQUIRED`, no PASS.

## PWA

El app shell rota a `r33-ui-v4-1-2-hardening`.

Se elimina del cache el módulo post-render retirado y se mantienen todos los assets v4 necesarios para operación offline. La actualización no borra IndexedDB, localStorage, sesiones ni datos de negocio.

## WhatsApp

Este hardening visual no otorga autoridad nueva al bot. La UX puede mostrar estados y modales de operación, pero SOURCE y LAB siguen los gates documentados en `WHATSAPP_READINESS_2026-09-29.md` y `WHATSAPP_PRODUCTION_COMPLIANCE.md`.

## Verificación

Requerido para considerar el cambio totalmente validado:

- contratos Node v4.1/v4.1.2;
- `node --check` de módulos de shell/PWA;
- Playwright shell + anti-overlap;
- screenshots comparativos revisados;
- QA móvil/touch;
- Pages sirviendo el SHA exacto.

Un job sin runner/steps se reporta `BLOCKED_INFRASTRUCTURE / NOT_EXECUTED`, nunca PASS.

## Rollback

Rollback de presentación:

1. revertir el commit/merge de v4.1.2;
2. restaurar el `SHELL_CACHE` anterior sólo junto con los assets correspondientes;
3. no tocar IndexedDB ni datos del workspace;
4. no restaurar `icon-normalization-v41.js` de forma aislada: si hiciera falta volver atrás, se revierte la unidad completa de UI/PWA.

No hay migración de base de datos ni rollback de datos asociado a este hardening.
