# ERP #155 — corrección de completitud por viewport

## Hallazgo

El primer harness de #155 separaba `viewports` del arreglo de casos. La matriz tenía 58 rutas × 7 estados × 3 roles = 1.218 casos lógicos, pero el viewport no formaba parte de la identidad de cada caso. Por tanto un registro podía aparentar cobertura completa de `route × state × role` aunque no existiera evidencia independiente para mobile, tablet y desktop.

## Corrección

El contrato v2 define cada caso como:

`route × state × role × viewport`

Con el catálogo actual el total es:

`58 × 7 × 3 × 3 = 3.654 casos de evidencia`.

Cada caso conserva `viewport`, `width` y `height`. El gate rechaza:

- evidence schema v1;
- casos duplicados;
- casos desconocidos;
- geometría ausente;
- matriz incompleta;
- estados fuera de `PASS|FAIL|BLOCKED|NOT_EXECUTED`.

El resumen agrega conteos globales y por viewport. `BLOCKED` y `NOT_EXECUTED` continúan sin convertirse en PASS.

## Migración de evidencia

La evidencia v1 no se migra automáticamente porque no puede inferirse en qué viewport se ejecutó cada caso. Para un nuevo candidate SHA se debe ejecutar `init` y producir evidence v2. Para un SHA histórico con evidence v1, conservar el artifact como histórico y no presentarlo como campaña completa.

## Seguridad

Este cambio no toca datos productivos, autorización, reglas financieras ni tenant isolation. Sólo endurece la identidad y completitud de la evidencia QA.
