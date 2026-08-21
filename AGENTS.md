# ContaGest: guía para agentes y colaboradores

## Objetivo

ContaGest es un ERP contable multi-tenant para Venezuela con módulos horizontales, verticales operativas y un backend Express/Prisma. Los cambios deben conservar trazabilidad fiscal, aislamiento por tenant y una experiencia densa pero legible para operación diaria.

## Mapa rápido

- `backend/src/app.ts`: composición Express, middleware, seguridad y rutas.
- `backend/src/modules/`: dominios backend y servicios por módulo.
- `backend/prisma/schema.prisma`: modelo persistente; cada entidad de negocio debe mantener `tenantId` y sus índices/relaciones.
- `backend/prisma/migrations/`: cambios de esquema versionados; nunca editar una migración ya aplicada para corregir datos históricos.
- `frontend/src/app.js`: registro, carga y ciclo de vida de páginas.
- `frontend/src/pages/`: vistas de negocio; reutilizar componentes y servicios existentes.
- `frontend/src/components/ui/`: kit visual compartido.
- `frontend/src/styles/erp-runtime.css`: único entrypoint CSS importado por `app.js`.
- `frontend/src/styles/contagest-visual-system-v12.css`: autoridad canónica de tokens, tipografía, densidad, cards, forms, tablas, responsive, theming y motion.
- `frontend/src/services/`: llamadas API y servicios de dominio.
- `tests/`: contratos Node estáticos y de integración; `qa/` y `playwright.config.mjs`: QA browser.
- `docs/`: decisiones, auditorías, seguridad, diseño y runbooks.

## Skills y precedencia

Para cambios visuales usar primero las skills locales del proyecto:

- `.agents/skills/contagest-erp-orchestrator/SKILL.md` para alcance, seguridad y gates;
- `.agents/skills/contagest-ui-audit/SKILL.md` para crítica de jerarquía, spacing, typography, responsive y anti-template;
- `.agents/skills/contagest-motion/SKILL.md` para motion funcional;
- referencias pinned de Impeccable/Emil como apoyo;
- Taste únicamente como inspiración para evitar salidas genéricas, nunca como autoridad de marca.

La política de ContaGest, accesibilidad, seguridad, contabilidad y tenant isolation siempre prevalece sobre una recomendación externa.

## Comandos de verificación

Ejecutar desde la raíz:

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run check:bundle
npm run audit:prod
npm run skills:check
npm run test:browser
```

`npm run lint` ejecuta typecheck y la suite Node. No marcarlo como verde si cualquiera de las dos fases falla. El build puede tocar artefactos generados en `api/index.js` y `frontend/api/index.js`; revisar el diff antes de incluirlos.

## Reglas de seguridad y dominio

- Resolver tenant desde la sesión/control de acceso; nunca aceptar `tenantId` del cliente como autoridad.
- Todas las consultas y mutaciones de negocio deben aplicar tenant isolation, autorización por rol/licencia y validación de entrada.
- Los secretos del servidor solo viven en backend/env; no incluir valores reales ni acceder a secretos server-only desde frontend.
- El RIF es identidad fiscal: después del registro se trata como campo bloqueado; una corrección requiere flujo autorizado y evidencia.
- Asientos, libros, impuestos, cierres y documentos fiscales necesitan idempotencia, auditoría y preservación de precisión monetaria.
- No probar migraciones destructivas contra producción. Usar una base efímera o fixture controlado.
- Hípico opera en shadow/offline-first y no debe mezclarse con Fitness ni con la contabilidad core sin un contrato explícito.

## UI/UX y accesibilidad

- La única autoridad visual compartida es `frontend/src/styles/contagest-visual-system-v12.css`; no crear otro `*-vNN.css` para corregir un problema que afecte varias vistas.
- Preferir `frontend/src/components/ui/` y tokens `--cg-v-*` frente a CSS por vista.
- Títulos operacionales: 20–26 px desktop; títulos de sección 16–18 px; KPI 16–20 px. No usar jerarquía de landing page dentro del ERP.
- Las etiquetas de formularios permanecen en flujo normal; no usar `position:absolute` para resolver layout.
- KPI y importes deben usar `font-variant-numeric:tabular-nums`; los valores monetarios no deben partirse en dos líneas ni vivir dentro de círculos/blobs decorativos.
- La página no debe tener scroll horizontal. Solo tablas, tabs o contenedores explícitos pueden poseer `overflow-x:auto`.
- Todo hijo de grid/flex susceptible de crecer debe soportar `min-width:0`.
- Mantener contraste, foco visible, navegación por teclado y nombres accesibles en controles.
- La densidad ERP debe favorecer escaneo, alineación numérica y jerarquía; evitar gradientes, glass, sombras pesadas, hero marketing y decoración que compita con datos.
- En móvil, formularios pasan a una columna, acciones se envuelven y los KPI pasan a una columna en teléfonos estrechos.
- Motion: 120–170 ms, únicamente feedback funcional; respetar `prefers-reduced-motion`.

## Assets

- Marca global: `frontend/public/brand/`.
- Iconos PWA/app: `frontend/public/icons/`.
- Control Hípico conserva sus assets bajo `frontend/public/hipico-control/`.
- No duplicar logos en páginas ni crear assets globales dentro de módulos.
- La iconografía funcional compartida usa el helper `icon()` del UI kit salvo un caso de marca documentado.

## Flujo de cambios

1. Trabajar en una rama dedicada y registrar el estado inicial si el árbol no trae Git.
2. Leer la documentación del módulo y revisar contratos existentes antes de cambiar comportamiento.
3. Hacer el cambio mínimo, incluyendo prueba cuando corresponda.
4. Para UI: caracterizar desktop + móvil, ejecutar `contagest-ui-audit`, aplicar tokens/componentes y validar overflow/solapamientos.
5. Ejecutar checks proporcionales al riesgo y documentar PASS, FAIL, BLOCKED o NOT EXECUTED con evidencia.
6. No hacer merge ni despliegue sin solicitud expresa. Push de una rama de trabajo puede hacerse cuando el usuario lo haya pedido explícitamente.

Definition of Done: comportamiento implementado, tenant/RBAC/seguridad preservados, UI responsive y accesible, tests relevantes ejecutados, documentación actualizada y riesgos remanentes explicitados.
