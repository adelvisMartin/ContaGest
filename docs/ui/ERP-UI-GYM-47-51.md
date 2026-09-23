# 47/51 · GYM — Adherencia integral derivada

## Objetivo

Cerrar la última brecha funcional del vertical Fitness sin crear autoridades duplicadas.

La adherencia integra tres fuentes:

- nutrición: `GymMeal` + eventos explícitos `GymMealAdherenceEvent`;
- entrenamiento: `GymWorkoutSession/GymWorkoutSet`;
- evolución corporal: `GymAssessment`.

Sólo la adherencia de comidas necesita nueva persistencia. Entrenamientos y medidas siguen perteneciendo a sus tablas canónicas existentes.

## Eventos de comida

`GymMealAdherenceEvent` es append-only.

Cada evento registra:

- tenant;
- cliente;
- plan;
- comida planificada;
- estado `completed | skipped`;
- nota opcional;
- actor;
- timestamp server-side.

No existe UPDATE/DELETE de eventos. Si el usuario corrige una marcación, se agrega un nuevo evento y el estado actual se deriva del evento más reciente.

## Seguridad e integridad

Antes de insertar un evento el backend revalida dentro de una transacción:

1. cliente del tenant activo;
2. plan del mismo cliente/tenant;
3. comida perteneciente a ese plan;
4. advisory lock por comida.

El endpoint no acepta actor ni timestamp como autoridad desde el cliente.

## Resumen integrado

`GET /gym/adherence?memberId=...` deriva:

### Nutrición

- comidas planificadas;
- comidas debidas;
- completadas;
- omitidas;
- pendientes;
- porcentaje de adherencia;
- racha de días planificados completamente cumplidos.

Una comida sólo es “debida” cuando el plan tiene `startsAt` y la fecha derivada `startsAt + dayIndex - 1` no está en el futuro.

Los planes sin fecha de inicio no se reinterpretan retrospectivamente.

### Entrenamiento

Se leen exclusivamente sesiones `GymWorkoutSession` completadas en la ventana descriptiva de 28 días:

- sesiones completadas;
- días distintos de entrenamiento.

No se crea un segundo log de entrenamiento.

### Evolución corporal

Se leen las dos últimas filas `GymAssessment`:

- última evaluación;
- evaluación previa;
- delta de peso cuando ambas contienen peso.

No se duplican ni recalculan evaluaciones.

## UX

`IntegratedAdherencePanel.jsx` muestra:

- adherencia nutricional;
- completadas/omitidas/pendientes;
- racha nutricional;
- sesiones completadas;
- evolución corporal;
- objetivos declarados del cliente;
- listado de comidas debidas con acciones explícitas completar/omitir.

El panel es descriptivo. No prescribe, no cambia objetivos, no modifica rutinas, no cambia planes nutricionales y no infiere condiciones de salud.

## Boundary

47/51 completa el alcance funcional de Fitness.

48–51 corresponden a QA/release:

- 48: E2E real multi-vertical con PostgreSQL efímero;
- 49: matriz visual anti-solapamiento;
- 50: contract tests de componentes reutilizables;
- 51: release candidate demostrable y rollback/release decision.

## QA

- `erp_ui_gym_integrated_adherence_47_51.test.mjs`;
- Wave A fail-closed;
- CI/PostgreSQL/browser sólo se acreditan si el SHA exacto ejecuta steps reales.
