# Control Hípico UI System v4.1.2 — Hardening

Fecha: 2026-09-29

## Objetivo

Cerrar la deuda detectada después de v4.1/v4.1.1 sin introducir un segundo framework visual. La PWA de Control Hípico sigue siendo HTML/CSS/JavaScript nativo y `ui.js` continúa como autoridad de iconos, diálogos y notificaciones del producto.

## Cambios de arquitectura

### 1. Iconos en origen, no post-render

`operational-copy-center.js` importa `icon()` desde `ui.js` y renderiza directamente los SVG canónicos para:

- launcher de Textos de WhatsApp;
- cerrar diálogo;
- copiar / copiado;
- exportar;
- chevrons de secciones.

Se elimina `icon-normalization-v41.js` y su `MutationObserver` global. La interfaz deja de emitir glyphs `×`, `⌄`, `✦` o `✓` para luego sustituirlos.

### 2. Autoridad CSS explícita

`app.css` declara la cascada:

```css
@layer compat, v4, convergence;
```

La capa `ui-system-v3-compat.css` queda deliberadamente por debajo de UI System v4. Esto permite conservar markup heredado mientras se evita que reglas antiguas vuelvan a dominar paleta, densidad, layout o componentes modernos. `convergence` conserva únicamente reglas transversales de geometría y coexistencia.

### 3. Overlays, diálogos y toast

`ui-system-v4-overlays.css` centraliza:

- modal genérico;
- calendario;
- Help Center;
- `dialog` nativo del Centro Operativo;
- toast semántico.

No se incorpora React Hot Toast/Sonner dentro de Control Hípico. Aunque ContaGest ERP sí dispone de React/MUI/react-hot-toast, introducir ese runtime sólo para esta PWA crearía dos autoridades y más JavaScript. En Hípico se conserva el sistema nativo con estética equivalente: superficies semánticas, blur de backdrop, sombras/radios v4, estados por borde semántico, dark mode, mobile bottom-sheet y reduced motion.

### 4. Regresión visual real

`qa/hipico-ui-v41-shell.spec.mjs` conserva evidencia full-page exact-SHA y añade un gate determinista de `toHaveScreenshot()` sobre un sentinel visual sin texto ni antialias dependiente de fuentes. El sentinel bloquea cambios accidentales de:

- background/surface;
- brand/accent/danger;
- texto;
- altura canónica de control (36 px desktop);
- escala `type-sm` (13 px).

Los baselines Chromium/Linux están versionados junto a la spec. La suite funcional existente sigue verificando full-width, sidebar 224/66, persistencia, header, temas, branding, touch targets y responsive.

## PWA

La revisión de shell cambia a:

`r33-ui-v4-1-2-hardening`

El cache incluye `ui-system-v4-overlays.css` y deja de incluir el shim de iconos eliminado.

## Límites

Este hardening no modifica apuestas, saldos, Supabase, IndexedDB, liquidación, reglas de carreras ni autoridad financiera del bot. Sólo toca presentación, QA visual y operación segura del Bridge.

## Evidencia requerida

Para declarar PASS de release:

1. contratos Node v4.1/v4.1.2;
2. sintaxis de assets PWA;
3. Playwright Chromium de shell + anti-overlap + pixel-diff;
4. matriz Hípico preexistente;
5. SHA exacto y deploy Pages del mismo candidate.

Un job sin runner/steps o un deployment no ejecutado se clasifica `BLOCKED_INFRASTRUCTURE` / `NOT_EXECUTED`, nunca PASS.
