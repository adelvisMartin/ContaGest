# Clean Code · Access/Licensing · lote 6

## Objetivo

Separar datos/contratos declarativos de la lógica operacional en el bloque 52–57/75 sin cambiar el manifiesto canónico, RBAC, sesión, emisión de licencias ni experiencia vertical.

Baseline: `main@e85ac04c4a70a8cf7d8a2ba0362bf795a9ed731b`.

## AccessControlService

### Antes
`accessControlService.js` contenía simultáneamente:

- adaptación del access manifest;
- normalización de roles;
- autorización local/demo;
- persistencia/merge de estado RBAC;
- una tabla extensa de 18 presets de roles.

### Cambio
Los presets se extraen a:

`frontend/src/services/accessControlPresets.js`

como `createRolePresetInput(allModules)`.

`accessControlService.js` conserva:

- `MODULE_CATALOG_ACCESS`;
- canonicalización de módulos;
- derivación de permisos;
- normalización de roles;
- estado default;
- merge de estado guardado;
- autorización local/demo.

Caracterización: **15 métodos públicos antes y después, mismo orden/nombre**.

## Licensing

### Antes
`licenses.routes.ts` mezclaba:

- Router/handlers;
- provisioning/transacciones;
- RBAC derivado;
- auditoría;
- allowlists y schemas Zod.

### Cambio
Se crea:

`backend/src/modules/licenses/licenses.contracts.ts`

como autoridad declarativa de:

- `BUSINESS_SECTORS`;
- `COMMERCIAL_USES`;
- módulos canónicos derivados del access manifest;
- route allowlist;
- `licenseSchema`;
- `validateSchema`.

`licenses.routes.ts` conserva generación de keys, normalización de config, provisioning, roles, subscriptions, transacciones, auditoría y respuestas.

Caracterización: **6/6 rutas HTTP idénticas**.

## Invariantes 52–57

- `access-manifest.json` sigue siendo la fuente de verdad;
- `accessManifestRuntime.js` sigue validando fail-closed;
- los permisos de ruta siguen derivados del manifiesto;
- licensing sólo acepta módulos/rutas canónicos;
- no cambian sectores, planes, límites, cookies, device credentials ni subscriptions;
- 60/75 sigue siendo la autoridad de navegación autenticada desde sesión;
- no cambia ningún endpoint ni método público.

## Trazabilidad

La matriz 1–58 añade `CLEAN_CODE_BATCH_6_ACCESS_LICENSING` a 52, 53, 54, 55, 56 y 57.

## Regresión

`tests/access_licensing_clean_code_batch6.test.mjs`.

Los checks remotos sólo cuentan como PASS cuando el SHA exacto ejecuta runner, steps y logs reales.
