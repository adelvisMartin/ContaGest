# 33/51 · P0 GYM — Constructor estructurado de rutinas

## Problema

La ruta de rutinas todavía dependía de un textarea con formato manual:

`Día | Ejercicio | Grupo | Series | Reps | Descanso`

y un parser basado en `split('\n')` + `split('|')`.

Eso hacía frágil la edición, dificultaba la validación y bloqueaba las siguientes fases del roadmap: biblioteca avanzada, programación semanal, modos, técnicas, progresión y periodización.

## Solución

`RoutineBuilder.jsx` pasa a ser el editor reutilizable de ejercicios.

Es un componente controlado:

- `value`: arreglo de ejercicios;
- `onChange`: nueva versión estructurada;
- `disabled`: bloqueo explícito.

No crea su propia autoridad de datos ni hace requests.

## Campos por ejercicio

Se preserva exactamente la forma que acepta `routineSchema`:

- `exerciseId`;
- `exerciseName`;
- `muscleGroup`;
- `equipment`;
- `instructions`;
- `dayOfWeek`;
- `sortOrder`;
- `sets`;
- `reps`;
- `loadKg`;
- `restSeconds`;
- `tempo`;
- `notes`.

## Operaciones

El constructor permite:

- agregar;
- quitar;
- duplicar;
- subir/bajar;
- seleccionar desde `FITNESS_EXERCISES`;
- editar manualmente nombre/equipo/grupo;
- configurar series/reps/carga/descanso/tempo/notas.

El orden se normaliza a `sortOrder=1..N` antes de persistir.

## Autoridad

La persistencia sigue siendo:

`GymManagementPage → GymVerticalService.createRoutine → POST /gym/routines → GymRoutine + GymRoutineExercise`

No se crea un segundo servicio ni modelo de rutina.

La escritura server-side también queda endurecida: `GymRoutine` y todos sus `GymRoutineExercise` se crean dentro de una única transacción; cliente, instructor y cualquier `exerciseId` existente deben pertenecer al tenant activo. Un fallo intermedio revierte la rutina completa y evita planes parciales.

El POST de rutinas queda además endurecido para que la escritura sea atómica:

- `prisma.$transaction` cubre rutina + ejercicios;
- cliente e instructor se validan contra el tenant activo;
- un `exerciseId` existente también se valida contra el tenant;
- si cualquier ejercicio falla, no queda una rutina parcial;
- ejercicios nuevos siguen reutilizando `GymExercise` mediante el unique `tenantId + name`.

## Límites deliberados

33/51 crea la base estructurada, pero no adelanta fases posteriores:

- 34/51: biblioteca avanzada de ejercicios;
- 35/51: programación semanal real;
- 36/51: modos explícitos;
- 37/51: técnicas de intensidad;
- 38/51: progresión;
- 39/51: periodización;
- 40/51: ejecución sesión-a-sesión.

## QA

- contrato dedicado `erp_ui_gym_routine_builder_33_51.test.mjs`;
- Wave A falla si reaparece `exerciseLines`, el textarea delimitado o DOM imperativo;
- exige un único owner de `RoutineBuilder`;
- exige persistencia por `GymVerticalService.createRoutine`.

Browser/build/typecheck sólo son PASS si el SHA exacto ejecuta realmente esos gates.
