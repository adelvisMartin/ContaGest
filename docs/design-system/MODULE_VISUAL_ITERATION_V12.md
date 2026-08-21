# ContaGest VE · Matriz visual por módulo

> **Documento histórico de v12, consolidado en v13.** La autoridad actual es `VISUAL_CONSOLIDATION_V13.md`, `qa/support/module-visual-catalog.mjs` y `scripts/visual-system-audit.mjs`.

La matriz v12 dejó de utilizar estados manuales como `ITERACIÓN PENDIENTE`, `INVESTIGACIÓN PENDIENTE` o listas de CSS legacy. v13 transforma esos pendientes en contratos ejecutables: las 58 rutas de `pageRegistry` deben coincidir con el catálogo de QA, el runtime sólo puede cargar los seis pilares visuales autorizados y los módulos críticos tienen invariantes verificables.

## Estado estructural v13

- **Contabilidad / Libro Diario:** migrado al UI kit canónico. Los estilos de documentos de impresión están explícitamente aislados mediante `data-cg-print-only` para que no contaminen ni falseen el audit de UI runtime.
- **Admin / RBAC:** permissions, formularios, tablas y superficies administrativas consumen la misma escala de tokens/primitives. Su geometría de dominio vive en `module-adapters.css`, no en un sistema administrativo paralelo.
- **Salud / Veterinaria:** `HealthcarePage` es exclusivamente humano y `veterinaria` apunta a `VeterinaryClinicPageV1123.jsx`; ya no existe una segunda rama veterinaria dentro de Salud.
- **Fitness / Gym:** `cg-gym-*` queda como conjunto de hooks de dominio, no como mini design system. Tipografía, controles, superficies, responsive y temas provienen de los pilares canónicos.
- **Temas:** solamente `light` y `dark` son estados globales válidos.
- **CSS:** `frontend/src/styles/` queda reducido a seis archivos pilares. `styles/legacy/`, Tailwind runtime, Precision Ledger, shells/headers históricos, themes antiguos, responsive/hotfixes versionados y shims duplicados fueron retirados del árbol.

## Seis iteraciones obligatorias por ruta

Cada una de las 58 rutas continúa recorriendo el mismo ciclo, ahora automatizado:

1. **Source/ownership:** UI kit, estilos inline, imports CSS, raw components, duplicación funcional y ownership de selectors/tokens.
2. **Desktop 1440/1024:** jerarquía, KPI, forms, tables, cards, scroll owners y primer viewport.
3. **Tablet 768:** colapso de layouts, sidebar, filtros, tablas y acciones.
4. **Mobile 430/390/360:** cero overflow del documento, touch targets, nowrap monetario, campos y acciones sin colisión.
5. **Theme/state/a11y:** Light/Dark, empty/one/many, loading/error/disabled, foco, teclado y reduced motion.
6. **Cleanup/regression:** retirar la declaración supersedida y repetir source audit + contratos + Playwright.

La lista ejecutable completa no se duplica aquí para evitar drift. Consultar:

```text
qa/support/module-visual-catalog.mjs
```

## Gates

```bash
npm run audit:visual:strict
npm run test:visual
npm run test:browser:visual
npm run test:browser:visual:deep
```

En Windows:

```powershell
.\QA-VISUAL-CONTAGEST.ps1
```

El source/cascade gate puede certificar que la arquitectura visual quedó consolidada. El estado **BROWSER PASS** sólo puede declararse después de ejecutar Playwright realmente; un build, una inspección de código o un merge anterior no sustituyen esa evidencia.
