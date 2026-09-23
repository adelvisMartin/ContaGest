# 35/51 · GYM — Programación semanal real

## Objetivo

Convertir `dayOfWeek` en un calendario semanal explícito y hacer que `daysPerWeek` represente la frecuencia realmente programada.

## Semántica canónica

`frontend/src/data/fitnessWeekDays.js` define:

1. Lunes
2. Martes
3. Miércoles
4. Jueves
5. Viernes
6. Sábado
7. Domingo

`RoutineBuilder` usa este catálogo en lugar de etiquetas genéricas Día 1…7.

## Frecuencia derivada

La UI ya no pide manualmente Días/semana.

Al guardar:

- obtiene los `dayOfWeek` únicos de los ejercicios;
- deriva `daysPerWeek` de ese conjunto;
- envía ambos datos a la API.

El backend aplica `routineSchema.superRefine` y rechaza una rutina si `daysPerWeek` no coincide con la cantidad de días programados.

## Vista semanal

`WeeklyRoutineSchedule.jsx` muestra siempre los siete días:

- agrupa ejercicios por `dayOfWeek`;
- conserva `sortOrder`;
- muestra series, repeticiones y descanso;
- marca días sin ejercicios como Día de descanso;
- tiene empty state cuando todavía no hay programación.

## Autoridad

No se añade una tabla de calendario.

La programación sigue viviendo en:

- `GymRoutine.daysPerWeek`;
- `GymRoutineExercise.dayOfWeek`;
- `GymRoutineExercise.sortOrder`.

## Límites

35/51 no introduce todavía modos, técnicas, progresión, periodización ni ejecución de sesiones. Esos contratos pertenecen a 36–40.

## QA

- `erp_ui_gym_weekly_schedule_35_51.test.mjs`;
- Wave A exige lunes–domingo canónicos;
- prohíbe volver a un input manual de frecuencia;
- exige derivación de frecuencia y validación backend;
- exige un único `WeeklyRoutineSchedule`.
