# 37/51 · Gimnasio · Técnicas de intensidad explícitas

## Objetivo

Permitir que cada ejercicio de una rutina registre una técnica de intensidad **explícita y auditable**, separada del modo general de entrenamiento de 36/51.

## Técnicas canónicas

- `standard` · técnica estándar;
- `drop_set`;
- `rest_pause`;
- `myo_reps`;
- `cluster`;
- `superset`;
- `giant_set`;
- `mechanical_drop`;
- `isometric_hold`.

`fitnessIntensityTechniques.js` centraliza etiqueta, descripción y campos de configuración aplicables.

## Configuración estructurada

Cada `GymRoutineExercise` persiste:

- `intensityTechnique`;
- `techniqueConfig` JSONB con campos conocidos:
  - `rounds`;
  - `intraRestSeconds`;
  - `loadDropPct`;
  - `groupKey`;
  - `holdSeconds`;
  - `techniqueNotes`.

Backend valida combinaciones mínimas: drop set exige porcentaje de reducción; rest-pause/myo/cluster exigen descanso intra-técnica; superset/giant set exigen clave de grupo; isométrico exige duración.

Además, la rutina valida la estructura del grupo: un `superset` debe contener exactamente dos ejercicios con la misma clave en el mismo día; un `giant_set` exige al menos tres. Una misma clave/día no puede mezclar ambos tipos.

## Compatibilidad

La migración usa `standard` como default para ejercicios históricos: no atribuye una técnica especial que nunca fue registrada.

El GET de rutinas ya agrega `GymRoutineExercise` completo, por lo que los nuevos campos viajan en la misma autoridad existente.

## UI

`RoutineBuilder` muestra sólo los controles pertinentes a la técnica seleccionada. `GymManagementPage` sanea los números/strings antes de persistir y `WeeklyRoutineSchedule` muestra la técnica programada.

## Frontera con 36/38/39

- el modo 36 **no selecciona** técnicas automáticamente;
- 37 no implementa progresión de cargas/reps;
- 37 no implementa periodización;
- series, reps, carga y descanso existentes no se reescriben de manera oculta.

## QA

- contrato dedicado `erp_ui_gym_intensity_techniques_37_51.test.mjs`;
- Wave A bloquea pérdida del catálogo, validación, persistencia o separación mode/technique;
- CI/browser/PostgreSQL sólo son PASS con ejecución real del SHA exacto.
