# 11/51 · Odontograma estructurado real

## Problema

El registro odontológico persistía únicamente una pieza dental y el procedimiento dentro de `clinicalData`. No distinguía dentición ni superficies ni una condición clínica estructurada.

## Contrato

Todo nuevo encuentro `type=dental-treatment` persiste:

- `dentition`: `permanent` o `primary`;
- `tooth`: pieza FDI compatible con la dentición seleccionada;
- `surfaces`: una o más superficies estructuradas;
- `condition`: condición clínica no vacía;
- `procedure`: procedimiento existente.

Los campos legacy `clinicalData.tooth` y `clinicalData.procedure` se mantienen como espejo de compatibilidad para consumidores ya existentes. La autoridad nueva es `clinicalData.odontogram`.

## Backend

`health.routes.ts` valida la estructura sólo para nuevos `dental-treatment`. Otros tipos de encuentro conservan el contrato `clinicalData: jsonRecord`. La persistencia sigue en `CareEncounter.clinicalData` JSONB, por lo que no se requiere migración de tabla ni se reescribe historia previa.

## Frontend

El odontograma permite elegir dentición permanente/temporal, pieza, una o más superficies y condición antes de firmar el tratamiento. Cambiar dentición, pieza o paciente limpia selecciones incompatibles.

## Regresión

El test 11/51 y el auditor Wave A bloquean el retorno a un odontograma que persista sólo número de pieza.
