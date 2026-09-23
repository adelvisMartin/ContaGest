# 50/51 · Contratos de componentes reutilizables Cg*

## Objetivo

Cerrar la migración UI con un gate explícito sobre los primitives canónicos reutilizables, evitando que una ruta migrada vuelva a recrear PageHeader, Button, Field, Select, Dialog, Table o estados localmente.

## Contrato estático

El test `erp_cg_reusable_contract_50_51.test.mjs` verifica:

- `CgPageHeader` responsive con actions wrap;
- `CgIconButton` exige nombre accesible;
- `CgTextField` y `CgSelect` exigen label persistente;
- `CgDialog` exige título accesible y usa `aria-labelledby`;
- `CgDataTable` conserva headers semánticos y empty state;
- `CgState`/empty/loading/error permanecen en la capa canónica;
- touch sizing de 44 px y reduced-motion siguen en el owner visual;
- ningún archivo JS/JSX fuera de `CgPrimitives.jsx` puede redefinir un owner Cg canónico.

## Contrato browser

`qa/cg-primitives-v5051.spec.mjs` usa los pilotos reales de `marca` y `ayuda` para validar:

- labels y accessible names;
- icon button táctil ≥44 px;
- diálogo visible, foco dentro del diálogo, Escape y restauración de foco;
- estado observable del field/button de ayuda;
- reduced-motion solicitado al navegador.

## Integración

La suite forma parte de `test:browser:58:core`; no es un gate huérfano.

## Cierre

PASS browser requiere ejecución real de Chromium sobre el SHA exacto. Un job sin runner/steps se clasifica `BLOCKED_INFRASTRUCTURE`, no PASS.
