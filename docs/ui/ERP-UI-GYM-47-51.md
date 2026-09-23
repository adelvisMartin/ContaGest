# 47/51 · Gimnasio — adherencia integral

## Objetivo

Consolidar el seguimiento real del cliente sin crear autoridades paralelas para datos que ya existen.

47/51 cubre:

- adherencia de comidas;
- sesiones de entrenamiento completadas;
- hábitos;
- peso y medidas;
- fotos de progreso autorizadas;
- objetivos explícitos;
- evolución por período.

No implementa gamificación, rachas, puntos, badges ni rankings.

## Autoridades reutilizadas

### Entrenamientos

La adherencia no duplica sesiones ni series.

Lee directamente:

- `GymWorkoutSession`;
- `GymWorkoutSet`.

Una sesión cuenta como entrenamiento realizado únicamente cuando su estado canónico es `completed`.

### Peso y medidas

No se crea una tabla de peso paralela.

La evolución corporal usa `GymAssessment`, incluyendo cuando están disponibles:

- peso;
- altura;
- porcentaje de grasa;
- masa muscular;
- IMC;
- fecha de medición.

## Nuevas autoridades

### Comidas

`GymMealAdherenceEvent` es append-only.

Estados:

- `completed`;
- `partial`;
- `skipped`.

La comida planificada continúa siendo `GymMeal`; el evento solo registra adherencia. El estado actual se obtiene del último evento de esa comida.

### Hábitos

`GymHabit` define un hábito explícito por cliente y un objetivo semanal.

`GymHabitCheckIn` registra eventos append-only:

- `completed`;
- `skipped`.

Los hábitos se archivan/reactivan. No existe DELETE operacional.

### Objetivos

`GymAdherenceGoal` registra objetivos explícitos:

- entrenamientos por semana;
- porcentaje de adherencia de comidas;
- porcentaje de adherencia de hábitos;
- peso objetivo;
- objetivo personalizado.

No existe motor automático de recomendación.

### Fotos de progreso

`GymProgressPhoto` conserva metadata y una ruta privada.

Requisitos obligatorios:

- cliente del tenant activo;
- upload aislado con `entityType = gym-progress`;
- path bajo `<tenant>/gym-progress/<member>/...`;
- autorización explícita confirmada;
- fecha/hora de captura.

La foto de progreso no reemplaza `GymMember.photoUrl`.

## API

### Lectura integral

`GET /gym/adherence?memberId=...&from=YYYY-MM-DD&to=YYYY-MM-DD`

- default: últimos 28 días;
- máximo: 366 días;
- tenant scoped;
- compone comidas, sesiones completadas, evaluaciones, hábitos, objetivos y fotos;
- no muta ninguna autoridad existente.

### Escrituras

- `POST /gym/adherence/meals`;
- `POST /gym/adherence/habits`;
- `PATCH /gym/adherence/habits/:id`;
- `POST /gym/adherence/habits/:id/checkins`;
- `POST /gym/adherence/goals`;
- `PATCH /gym/adherence/goals/:id`;
- `POST /gym/adherence/photos`.

## Métricas

La lectura deriva:

- comidas planificadas;
- completas;
- parciales;
- omitidas;
- sin registrar;
- porcentaje de adherencia de comidas;
- entrenamientos completados;
- evaluaciones registradas;
- fotos autorizadas;
- cumplimiento de cada hábito.

Para adherencia de comidas:

- completada = 1;
- parcial = 0.5;
- omitida/sin registro = 0.

La métrica es descriptiva y no produce decisiones clínicas.

## UX

`FitnessAdherencePanel` agrega una pestaña **Adherencia** al módulo gimnasio.

Incluye:

- selector de cliente;
- rango temporal;
- KPIs descriptivos;
- registro de comidas;
- creación/check-in/archivo de hábitos;
- objetivos;
- historial de mediciones canónicas;
- conteo de entrenamientos canónicos;
- carga y visualización temporal firmada de fotos privadas autorizadas.

## Privacidad

Las fotos:

- aceptan JPEG/PNG/WebP;
- usan el límite privado existente de 3 MB;
- se almacenan mediante backend;
- requieren `gym.manage`;
- quedan tenant scoped;
- exigen autorización explícita por carga;
- se muestran mediante signed URLs temporales.

## Frontera

47/51 no implementa:

- gamificación;
- streaks/rachas;
- puntos;
- badges/insignias;
- leaderboard/rankings;
- una segunda autoridad de entrenamiento;
- una segunda autoridad de peso/medidas;
- diagnóstico o recomendación clínica automática.

## QA

- regresión dedicada `tests/erp_ui_gym_integral_adherence_47_51.test.mjs`;
- Wave A falla si se duplica la autoridad de workout/assessment, se pierde la autorización de foto o aparece gamificación;
- CI/browser/PostgreSQL solo se consideran PASS cuando el SHA exacto ejecuta steps reales.
