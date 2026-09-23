# 38/51 · Gimnasio · Motor de progresión

## Objetivo

Añadir progresión explícita y auditable a cada ejercicio de rutina sin convertir el sistema en un autopiloto clínico/deportivo ni adelantar la ejecución de sesiones de 40/51.

## Estrategias canónicas

- `manual`;
- `linear_load`;
- `double_progression`;
- `percent_1rm`.

Cada `GymRoutineExercise` conserva `progressionStrategy` y `progressionConfig` dentro de la misma autoridad de rutina existente.

## Configuración estructurada

La configuración admite, según la estrategia:

- rango de repeticiones mínimo/máximo;
- incremento de repeticiones;
- incremento de carga;
- RIR objetivo;
- RPE objetivo;
- 1RM de referencia;
- porcentaje de 1RM;
- umbral de estancamiento por fallos consecutivos;
- porcentaje de reset de carga.

RIR y RPE son criterios explícitos de esfuerzo. Si se informan ambos deben ser coherentes con la relación aproximada `RPE = 10 - RIR`.

## Evaluador determinista

`POST /gym/progression/evaluate` recibe estrategia, configuración, prescripción actual y evidencia de rendimiento suministrada explícitamente.

Devuelve:

- acción recomendada;
- carga/repeticiones actuales;
- siguiente carga/repeticiones;
- códigos de razón;
- `applied: false`.

El evaluador **no modifica la rutina ni persiste una sesión**. La decisión final y cualquier edición siguen siendo explícitas.

### Doble progresión

- mientras se cumpla el objetivo dentro del rango, aumenta repeticiones;
- al alcanzar el techo, aumenta la carga y vuelve al mínimo;
- si no se cumple el objetivo, mantiene la prescripción;
- el umbral de estancamiento puede recomendar un reset porcentual.

### Lineal

Aumenta carga sólo cuando se completan las repeticiones prescritas y la evidencia de esfuerzo cumple el objetivo configurado.

### %1RM

Calcula una carga objetivo a partir de `oneRepMaxKg × percent1Rm` y la redondea al incremento de carga configurado.

## Seguridad y límites

- no estima automáticamente el 1RM desde historial inexistente;
- no inventa RIR/RPE;
- si falta evidencia de esfuerzo requerida, mantiene la prescripción;
- no aplica cambios automáticamente;
- no mezcla periodización/fases (39/51);
- no crea sesiones ni series realizadas (40/51).

## QA

- contrato dedicado `erp_ui_gym_progression_engine_38_51.test.mjs`;
- Wave A falla si se pierde persistencia, validación, catálogo o separación con 39/40;
- CI/browser/PostgreSQL sólo se consideran PASS con ejecución real del SHA exacto.
