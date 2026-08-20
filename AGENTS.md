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
- `frontend/src/components/` y `frontend/src/styles/erp-system.css`: sistema visual compartido.
- `frontend/src/services/`: llamadas API y servicios de dominio.
- `tests/`: contratos Node estáticos y de integración; `qa/` y `playwright.config.mjs`: QA browser.
- `docs/`: decisiones, auditorías, seguridad, diseño y runbooks.

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
- Hipico opera en shadow/offline-first y no debe mezclarse con Fitness ni con la contabilidad core sin un contrato explícito.

## UI/UX y accesibilidad

- Preferir tokens y componentes compartidos frente a CSS por vista.
- Las etiquetas de formularios permanecen en flujo normal; no usar `position: absolute` para resolver layout.
- KPI y importes deben usar `font-variant-numeric: tabular-nums`; los valores monetarios no deben partirse en dos líneas.
- Mantener contraste, foco visible, navegación por teclado y nombres accesibles en controles.
- La densidad ERP debe favorecer escaneo, alineación numérica y jerarquía; evitar decoración que compita con datos.

## Flujo de cambios

1. Trabajar en una rama dedicada y registrar el estado inicial si el árbol no trae Git.
2. Leer la documentación del módulo y revisar contratos existentes antes de cambiar comportamiento.
3. Hacer el cambio mínimo con `apply_patch`, incluyendo migración, servicio, UI y prueba cuando corresponda.
4. Ejecutar checks proporcionales al riesgo y documentar PASS, FAIL, BLOCKED o NOT EXECUTED con evidencia.
5. No hacer merge, push, despliegue ni rotación de secretos sin solicitud expresa.

Definition of Done: comportamiento implementado, tenant/RBAC/seguridad preservados, UI responsive y accesible, tests relevantes ejecutados, documentación actualizada y riesgos remanentes explicitados.
