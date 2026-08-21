# ContaGest: guía para agentes y colaboradores

## Objetivo

ContaGest es un ERP contable multi-tenant para Venezuela con módulos horizontales, verticales operativas y un backend Express/Prisma. Los cambios deben conservar trazabilidad fiscal, aislamiento por tenant y una experiencia densa, consistente y legible para operación diaria.

## Mapa rápido

- `backend/src/app.ts`: composición Express, middleware, seguridad y rutas.
- `backend/src/modules/`: dominios backend y servicios por módulo.
- `backend/prisma/schema.prisma`: modelo persistente; cada entidad de negocio debe mantener `tenantId` y sus índices/relaciones.
- `backend/prisma/migrations/`: cambios de esquema versionados; nunca editar una migración aplicada para corregir historia.
- `frontend/src/app.js`: registro, carga y ciclo de vida de páginas. Los únicos temas globales son `light|dark`.
- `frontend/src/pages/`: vistas de negocio; reutilizar componentes y servicios existentes.
- `frontend/src/components/ui/`: kit visual compartido y primera opción para cualquier UI nueva.
- `frontend/src/styles/erp-runtime.css`: único entrypoint CSS importado por `app.js`.
- `frontend/src/styles/contagest-visual-system-v12.css`: autoridad final de tokens, tipografía, densidad, surfaces, forms, tablas, estados, responsive, light/dark y motion.
- `frontend/src/styles/runtime-primitives-v13.css`: primitives internas de layout/compatibilidad, siempre expresadas con `--cg-v-*`.
- `frontend/src/styles/module-adapters.css`: única ubicación permitida para geometría estrictamente específica de dominio que no quepa en el UI kit.
- `frontend/src/styles/shell-contract.css` + `shell-stability-v1127.css`: invariantes actuales del shell/MUI.
- `scripts/visual-system-audit.mjs`: gate ejecutable de ownership, cascada, rutas, temas y migraciones críticas.
- `qa/support/module-visual-catalog.mjs`: inventario obligatorio de todas las rutas para QA visual.
- `tests/`: contratos Node; `qa/` y `playwright.config.mjs`: QA browser.

## Contrato visual v13 — no negociable

`frontend/src/styles/` debe contener únicamente estos seis archivos:

```text
contagest-visual-system-v12.css
erp-runtime.css
module-adapters.css
runtime-primitives-v13.css
shell-contract.css
shell-stability-v1127.css
```

Está prohibido reintroducir:

- `styles/legacy/`;
- Tailwind CSS runtime para decidir geometría del ERP;
- Precision Ledger como stylesheet independiente;
- otro shell/header versionado;
- themes `sector`, `enterprise`, `executive`, `finance`, `sky`, `soft-blue`, `spectrum`, `ocean`, `forest` o `celestial`;
- `runtime-hotfix-*`, `responsive-system-*` o compatibility shims;
- CSS importado directamente por una página;
- un nuevo `*-vNN.css` para corregir una sola pantalla.

Si un módulo necesita estructura genuinamente propia, primero se intenta resolver con `components/ui`. Si no alcanza, la regla vive en `module-adapters.css`, usa sólo tokens `--cg-v-*`, queda scoped al módulo y debe incluir/regresar con QA.

## Skills y precedencia

Para cambios visuales usar en este orden:

1. `.agents/skills/contagest-erp-orchestrator/SKILL.md` — alcance, seguridad y gates.
2. `.agents/skills/contagest-ui-audit/SKILL.md` — source/cascade, jerarquía, spacing, typography, responsive y anti-template.
3. `.agents/skills/contagest-motion/SKILL.md` — motion funcional después de estabilizar layout.
4. Referencias pinned de Impeccable/Emil como apoyo.
5. Taste sólo como inspiración crítica; nunca como autoridad de marca.

La política de ContaGest, accesibilidad, seguridad, contabilidad y tenant isolation siempre prevalece sobre una recomendación externa.

## Gates obligatorios

Ejecutar desde la raíz:

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run check:bundle
npm run audit:prod
npm run skills:check
npm run audit:visual:strict
npm run test:visual
npm run test:browser:visual
npm run test:browser:visual:deep
```

En Windows puede usarse `QA-VISUAL-CONTAGEST.ps1` para la cadena visual. Un build exitoso NO equivale a QA browser. Reportar siempre `PASS`, `FAIL`, `BLOCKED` o `NOT EXECUTED` con evidencia.

## Reglas del auditor visual

Antes de tocar CSS o markup, ejecutar `npm run audit:visual`. Después del cambio ejecutar `npm run audit:visual:strict`.

El strict gate debe fallar si aparece cualquiera de estos casos:

- una ruta de `pageRegistry` fuera del catálogo de QA o viceversa;
- un CSS adicional a los seis pilares;
- un import de runtime fuera de los pilares autorizados;
- un `styles/legacy/` recreado;
- un `<style>` que afecte UI runtime;
- un import CSS desde una vista;
- themes retirados en catálogo/runtime;
- regresión de la separación Salud/Veterinaria;
- pérdida del contrato canónico de Libro Diario, Admin/RBAC o Gym.

Los estilos que pertenecen exclusivamente a un documento de impresión deben marcarse:

```html
<style data-cg-print-only>...</style>
```

El auditor los separa del runtime visual; no usar esa marca para ocultar estilos de interfaz.

## Reglas de seguridad y dominio

- Resolver tenant desde sesión/control de acceso; nunca aceptar `tenantId` del cliente como autoridad.
- Toda consulta/mutación aplica tenant isolation, autorización por rol/licencia y validación de entrada.
- Los secretos server-only viven en backend/env; jamás valores reales en frontend o repo.
- El RIF es identidad fiscal; una corrección requiere flujo autorizado y evidencia.
- Asientos, libros, impuestos, cierres y documentos fiscales requieren idempotencia, auditoría y precisión monetaria.
- No probar migraciones destructivas contra producción.
- Control Hípico mantiene su aislamiento funcional/offline-first y no se mezcla con módulos core sin contrato explícito.

## UI/UX y accesibilidad

- Títulos operacionales: 20–26 px desktop; títulos de sección 16–18 px; KPI 16–20 px. No usar escala de landing page.
- Labels en flujo normal; no usar `position:absolute` para acomodar formularios.
- KPI/importes usan `tabular-nums`; moneda no se parte en dos líneas ni vive en círculos/blobs.
- La página no tiene scroll horizontal. Sólo tablas, tabs, kanban u otro owner explícito puede tener `overflow-x:auto`.
- Todo hijo de grid/flex que pueda crecer debe tolerar `min-width:0`.
- Mantener contraste, foco visible, teclado, `aria-*` y touch targets adecuados.
- Evitar gradientes, glass, sombras pesadas, hero marketing y decoración que compita con datos.
- Mobile: una columna cuando corresponda, acciones envueltas, cero clipping a 360/390/430.
- Motion 120–170 ms y feedback funcional; respetar `prefers-reduced-motion`.

## Reglas por módulos críticos

- **Contabilidad:** UI kit canónico, tablas con owner de scroll, importes alineados y `data-cg-print-only` para impresión aislada.
- **Admin/RBAC:** permisos, tablas, formularios y controles comparten primitives; no crear mini sistema administrativo.
- **Salud:** `HealthcarePage` es exclusivamente humano. Veterinaria usa `VeterinaryClinicPageV1123.jsx`; no recrear una segunda rama animal.
- **Fitness/Gym:** las clases `cg-gym-*` son identificadores de dominio, no un design system; toda geometría vive en `module-adapters.css` y usa tokens canónicos.
- **POS/Pedidos:** touch targets correctos y scroll horizontal sólo donde el flujo operativo lo exige.

## Assets

- Marca global: `frontend/public/brand/`.
- Iconos PWA/app: `frontend/public/icons/`.
- Control Hípico: `frontend/public/hipico-control/`.
- No duplicar logos ni assets globales dentro de módulos.

## Flujo de cambios

1. Trabajar en rama dedicada.
2. Leer módulo, contratos y audit actual antes de modificar.
3. Corregir primero ownership/primitives, después el módulo, y sólo al final polish/motion.
4. Reejecutar source audit, contratos estáticos y browser matrix proporcional al riesgo.
5. Eliminar declaraciones/archivos supersedidos en el mismo cambio; no acumular overrides.
6. Documentar evidencia y riesgos reales.
7. No hacer merge ni deploy sin solicitud expresa. Push/PR sólo cuando haya autorización explícita.

Definition of Done: comportamiento preservado, tenant/RBAC/seguridad intactos, una sola cascada visual, UI responsive/accesible, gates relevantes ejecutados y estado de evidencia explícito.
