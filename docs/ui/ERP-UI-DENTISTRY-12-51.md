# 12/51 · Estado visual odontológico por superficies

## Objetivo

Convertir el odontograma estructurado de 11/51 en una representación visual por superficie sin crear una segunda autoridad clínica.

## Fuente de verdad

El estado se deriva exclusivamente de encuentros `type=dental-treatment` ya persistidos en `CareEncounter.clinicalData.odontogram`.

Para cada combinación:

`dentition + tooth + surface`

la UI toma el encuentro estructurado más reciente y muestra su condición clínica. No se persiste un mapa visual paralelo, no se usa `localStorage` y no se reescribe historia.

## Superficies

- V · vestibular
- L/P · lingual / palatina
- M · mesial
- D · distal
- O/I · oclusal / incisal

## Accesibilidad

El estado no depende sólo del color:

- texto `Seleccionada`, `Con registro clínico` o `Sin registro`;
- abreviatura visible de superficie;
- `aria-label` con superficie, estado y condición cuando existe;
- borde sólido / doble / discontinuo como señal adicional;
- leyenda explícita.

## Compatibilidad

Los encuentros legacy que sólo contienen `clinicalData.tooth` siguen visibles en la historia, pero no reciben superficies inventadas.

## Persistencia

12/51 no agrega endpoints ni tablas. `HealthVerticalService.createEncounter` continúa siendo la única escritura del flujo rápido y 11/51 continúa validando el payload estructurado.

## QA

El test `erp_ui_dentistry_surface_state_12_51.test.mjs` y el auditor Wave A bloquean la pérdida del estado visual por superficies o la introducción de una segunda autoridad de persistencia.

Browser 360/390/430/768/1366 permanece `NOT_EXECUTED` mientras #134 bloquee runners.
