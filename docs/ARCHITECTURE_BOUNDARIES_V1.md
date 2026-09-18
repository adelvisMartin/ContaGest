# ContaGest — Architecture Boundaries v1

## Objetivo

Hacer explícitas y verificables las fronteras arquitectónicas actuales sin cambiar los contratos HTTP, permisos, middleware ni el orden efectivo de montaje de rutas.

## Dominios de composición

El backend clasifica cada registro del `MODULE_ROUTE_MANIFEST` en uno de cinco dominios:

- `platform`: capacidades transversales, seguridad, licencias, configuración, utilidades y servicios compartidos.
- `financial`: contabilidad, bancos, conciliación, fiscalidad, nómina financiera y reportes financieros.
- `commercial`: clientes, proveedores, ventas, compras y control comercial/licenciamiento comercial.
- `operations`: inventario, RRHH operativo, tareas, importaciones, QR, mapas y procesos operativos.
- `vertical`: paquetes opcionales o sectoriales que no deben convertirse en dependencia del núcleo ERP.

La clasificación es de composición y gobierno. No cambia por sí sola la API pública ni la autoridad de datos.

## Invariantes ejecutables

`npm run audit:architecture` verifica:

1. que `frontend/src/data/pageRegistry.js` y `qa/support/module-visual-catalog.mjs` siguen declarando exactamente 58 rutas;
2. que no aparecen duplicados ni drift entre ambas autoridades;
3. que módulos protegidos del núcleo ERP no importan paquetes verticales opcionales (`verticals` o `hipico-bot`);
4. que el resultado es determinista y falla con código distinto de cero ante una violación.

El CI ejecuta este gate antes de la suite general.

## Composition root

`backend/src/modules/index.ts` conserva únicamente responsabilidades transversales:

1. `/legal`;
2. aceptación legal vigente;
3. suscripción comercial;
4. approval execution gate;
5. montaje del manifiesto de módulos;
6. health check de base de datos.

Los routers concretos y CRUDs pasan a `backend/src/modules/route-manifest.ts`. El orden del manifiesto replica el orden legacy para preservar routing y precedencia.

## Regla de dependencias

La frontera es bidireccional y ejecutable:

- ningún módulo Core puede importar implementación de packs opcionales (`verticals`, `food`, `hipico`, `hipico-bot`);
- un pack opcional puede depender de `shared`, `database`, librerías externas y de archivos de su propia familia;
- `hipico` y `hipico-bot` forman una misma familia de pack y pueden colaborar entre sí;
- un pack opcional no puede importar directamente `accounting`, `sales`, `inventory`, `auth`, `rbac` u otra implementación interna del ERP.

Los cruces deben entrar mediante contratos/adapters ubicados en `backend/src/shared` o en una capa de integración explícita. `backend/src/shared/contracts/optional-pack.ts` define el contexto tenant mínimo compartido actualmente por los verticales.

## Lo que este cambio NO certifica

Este gate no significa que ContaGest esté al 100% ni que esté listo para producción. Siguen requiriendo evidencia separada, entre otros:

- P0 de login/CAPTCHA (#221);
- infraestructura CI (#134);
- protección/gobernanza de `main` (#97);
- campaña E2E transversal (#155);
- QA físico y soak de Control Hípico (#119/#120);
- gates legales, de rendimiento, persistencia real y release readiness aplicables.

## Vertical bounded contexts

`backend/src/modules/verticals/verticals.routes.ts` es un agregador delgado. La propiedad de rutas se separa en `health.routes.ts`, `gym.routes.ts` y `communications.routes.ts`, manteniendo un único `requireTenant` en el agregador y los permisos específicos en cada contexto.

La separación conserva los mismos paths y el mismo orden de handlers. La extensión de Health/Gym también se distribuye en `health-extended.routes.ts` y `gym-extended.routes.ts`, mientras `verticals-extended.routes.ts` actúa como agregador con un único `requireTenant`.

## Próximas extracciones seguras

Las refactorizaciones de mayor tamaño deben hacerse por PR independiente:

1. continuar reduciendo `frontend/src/app.js` sin cambiar las 58 rutas ni navegación/licenciamiento;
2. introducir contratos/adapters explícitos para dependencias entre Platform/Core y Vertical Packs;
3. extender el auditor con reglas de dependencia por dominio cuando el árbol ya refleje esas capas físicamente;
4. separar lógica de dominio repetida de routers únicamente cuando exista caracterización suficiente y sin mover autoridad financiera.

Cada extracción debe incluir caracterización previa y evidencia de equivalencia de comportamiento.
