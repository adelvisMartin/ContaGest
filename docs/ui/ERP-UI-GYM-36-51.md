# 36/51 · Gimnasio · Modos explícitos de entrenamiento

## Objetivo

Hacer explícita la intención principal de cada rutina sin convertir una etiqueta de modo en un algoritmo que reescriba la prescripción del entrenador.

## Modos canónicos

Las rutinas nuevas deben elegir uno de:

- `strength` · Fuerza;
- `hypertrophy` · Hipertrofia;
- `pump` · Bombeo / metabólico;
- `endurance` · Resistencia muscular;
- `power` · Potencia;
- `conditioning` · Acondicionamiento;
- `mobility` · Movilidad.

`frontend/src/data/fitnessTrainingModes.js` es el catálogo UI compartido y contiene descripción, foco y rangos **orientativos** de repeticiones/descanso.

## Persistencia

`GymRoutine.trainingMode` se agrega con default `unspecified` únicamente para preservar verdad histórica en filas legacy. El schema de creación **no acepta `unspecified`**: toda rutina nueva debe declarar un modo real.

La constraint DB acepta `unspecified` para poder leer/migrar historia existente sin fabricar una intención que nunca fue registrada.

## UI

El constructor muestra un selector obligatorio y una explicación contextual del modo elegido. Las rutinas activas muestran su modo; registros legacy aparecen como `Sin clasificar (legacy)`.

El modo **no modifica automáticamente** series, repeticiones, carga, descanso ni ejercicios. Técnicas/intensidad/progresión/periodización pertenecen a 37–39 y deben seguir siendo decisiones explícitas.

## Compatibilidad

Se preservan:

- programación semanal 35/51;
- biblioteca persistente 34/51 y su hardening;
- creación tenant-safe/transaccional 33/51;
- estructura `GymRoutine/GymRoutineExercise`.

## QA

- contrato dedicado `erp_ui_gym_training_modes_36_51.test.mjs`;
- Wave A bloquea pérdida del enum, selector, persistencia o frontera legacy;
- no se declara PASS de CI/browser sin ejecución real del SHA exacto.
