# ContaGest VE · Visual Consolidation v13

## Objetivo

v13 elimina la coexistencia de generaciones visuales históricas y establece una única autoridad de interfaz para todas las rutas registradas en `frontend/src/app.js`.

El objetivo no es ocultar CSS antiguo mediante más overrides. El objetivo es retirar del árbol los estilos supersedidos, conservar únicamente reglas de dominio que sigan siendo necesarias y hacer que tipografía, spacing, cards, formularios, tablas, estados, responsive, light/dark y motion nazcan de un mismo sistema.

## Pilares del runtime

`frontend/src/styles/erp-runtime.css` sólo puede cargar los siguientes pilares:

1. `shell-contract.css` — geometría e invariantes del shell.
2. `shell-stability-v1127.css` — seguridad vigente de shell/MUI mientras se absorbe en el contrato principal.
3. `runtime-primitives-v13.css` — primitives internas de layout y compatibilidad, todas tokenizadas.
4. `module-adapters.css` — geometría estrictamente específica de dominio para componentes operativos que no son primitives generales.
5. `contagest-visual-system-v12.css` — autoridad final de tokens, tipografía, superficies, formularios, tablas, estados, responsive, temas y motion.

Ningún módulo puede importar CSS propio. No se admiten compatibility shims, archivos `legacy/`, Tailwind runtime, Precision Ledger, shells/headers históricos, presets de temas retirados ni hotfixes de versiones anteriores.

## Temas

Los únicos temas globales soportados son `light` y `dark`. Una vertical puede expresar contexto mediante iconografía, contenido o acentos semánticos, pero no puede cambiar densidad, escala tipográfica, radio de cards, shell o geometría global.

## Módulos críticos cerrados en v13

- **Contabilidad / Libro Diario:** migrado a `PageHeader`, `MetricGrid`, `Section`, `Field`, `Select`, `Button`, `Table` y `Badge`. El CSS de impresión queda aislado con `data-cg-print-only` y no forma parte de la UI runtime.
- **Salud:** `HealthcarePage` queda exclusivamente humano. Veterinaria tiene una única implementación en `VeterinaryClinicPageV1123.jsx`; se elimina la rama animal duplicada de la vista Salud.
- **Admin/RBAC:** su geometría específica se concentra en `module-adapters.css`; controles, tablas, permisos y formularios heredan tokens/primitives únicos.
- **Fitness/Gym:** las clases históricas pueden permanecer temporalmente en el markup como identificadores de dominio, pero ya no poseen design system propio: sólo `module-adapters.css` puede darles geometría y todos sus valores provienen de `--cg-v-*`.

## Auditoría obligatoria

`scripts/visual-system-audit.mjs` es el gate de fuente/cascada. Debe verificar:

- paridad entre `pageRegistry` y el catálogo de QA;
- ausencia de estilos inline/runtime no permitidos;
- separación de `<style data-cg-print-only>`;
- inexistencia de CSS histórico o compatibility shims;
- grafo de imports reducido a los pilares autorizados;
- colisiones de selector y tokens;
- tamaños/radios/anchos rígidos, gradientes y pseudo-decoración de riesgo;
- adopción del UI kit y ownership de scroll en tablas/kanban.

Los resultados se escriben en `artifacts/qa/visual-source-audit.md` y `artifacts/qa/visual-source-audit.json`.

## QA browser

La matriz profunda cubre todas las rutas en 768, 1024 y 1440, y las rutas críticas además en 360, 390 y 430. Los criterios incluyen overflow de documento, elementos fuera del viewport, métricas partidas, controles recortados, overlays, owner de scroll, touch targets, Light/Dark y reduced motion.

Un módulo no se declara `BROWSER PASS` sólo porque compile o porque el source audit pase. El PASS de navegador requiere ejecución real de Playwright y evidencia del run.

## Regla de mantenimiento

Cuando un módulo necesite una diferencia genuina de dominio, primero se reutiliza un primitive del UI kit. Si eso no alcanza, se añade una regla estrechamente scoped a `module-adapters.css`. Está prohibido crear otro archivo CSS versionado para corregir una pantalla.
