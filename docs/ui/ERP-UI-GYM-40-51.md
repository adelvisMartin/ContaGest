# 40/51 · Gimnasio · Ejecución sesión-a-sesión

## Objetivo

Ejecutar una rutina real sesión por sesión y conservar la evidencia de cada serie realizada u omitida, sin adelantar la analítica histórica de 41/51.

## Autoridades

- `GymWorkoutSession`: una ejecución concreta de una `GymRoutine`;
- `GymWorkoutSet`: una serie concreta asociada a un `GymRoutineExercise`.

Sólo puede existir una sesión `in_progress` por tenant/cliente. Una sesión completada no vuelve a abrirse.

## Serie

Cada serie registra:

- ejercicio de la rutina;
- número de serie;
- estado `completed | skipped`;
- carga realizada;
- repeticiones realizadas;
- RIR opcional;
- RPE opcional;
- descanso tras la serie;
- notas;
- timestamp y actor.

Si se informan RIR y RPE simultáneamente se valida su coherencia aproximada. Una serie omitida no inventa carga, reps ni esfuerzo.

## Flujo

1. seleccionar rutina;
2. iniciar sesión;
3. seleccionar ejercicio;
4. registrar serie u omitirla;
5. usar el temporizador de descanso con el descanso configurado;
6. continuar hasta finalizar;
7. completar sesión.

El backend valida que la rutina y cada `routineExerciseId` pertenezcan al tenant y a la sesión activa.

## Concurrencia / consistencia

- advisory lock al iniciar sesión para el cliente;
- índice parcial impide dos sesiones activas simultáneas;
- row lock de la sesión serializa registros de series;
- unique `sessionId + routineExerciseId + setNumber` evita duplicar una posición;
- no se insertan series después de completar la sesión.

## Temporizador

El temporizador es UX declarativa del cliente. El dato persistido es `restSeconds` de la serie; el countdown no es una autoridad de backend ni genera writes periódicos.

## Límite con 41/51

40/51 **no** calcula:

- récords personales;
- volumen agregado;
- e1RM;
- frecuencia histórica;
- adherencia;
- gráficas por ejercicio/grupo/período.

Esas derivaciones pertenecen a 41/51 y consumirán las autoridades de sesión/serie creadas aquí.

## QA

- regresión dedicada `erp_ui_gym_workout_execution_40_51.test.mjs`;
- Wave A exige persistencia canónica, locks, tenant isolation, timer declarativo y frontera con 41;
- CI/browser/PostgreSQL sólo son PASS con steps reales del SHA exacto.
