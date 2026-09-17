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

1. que `frontend/src/app.js` y `qa/support/module-visual-catalog.mjs` siguen declarando exactamente 58 rutas;
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

El núcleo puede exponer contratos que consuman verticales, pero los dominios protegidos de contabilidad, banca, compras, ventas, inventario, seguridad y fiscalidad no pueden importar directamente implementación de `verticals` ni `hipico-bot`.

Las integraciones deben entrar mediante contratos/adapters ubicados en una capa compartida o de integración explícita.

## Lo que este cambio NO certifica

Este gate no significa que ContaGest esté al 100% ni que esté listo para producción. Siguen requiriendo evidencia separada, entre otros:

- P0 de login/CAPTCHA (#221);
- infraestructura CI (#134);
- protección/gobernanza de `main` (#97);
- campaña E2E transversal (#155);
- QA físico y soak de Control Hípico (#119/#120);
- gates legales, de rendimiento, persistencia real y release readiness aplicables.

## Próximas extracciones seguras

Una vez estabilizado este contrato, las refactorizaciones de mayor tamaño deben hacerse por PR independiente:

1. dividir `verticals.routes.ts` por bounded context conservando paths;
2. reducir `frontend/src/app.js` extrayendo el registro de navegación a una autoridad importable sin cambiar las 58 rutas;
3. introducir contratos/adapters explícitos para dependencias entre Platform/Core y Vertical Packs;
4. extender el auditor con reglas de dependencia por dominio cuando el árbol ya refleje esas capas físicamente.

Cada extracción debe incluir caracterización previa y evidencia de equivalencia de comportamiento.
