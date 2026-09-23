# 42/51 · Gimnasio · Sustituciones contextuales

## Objetivo

Permitir sustituir un ejercicio durante una sesión usando contexto **declarado** y explicable, sin convertir el sistema en un decisor médico ni modificar silenciosamente la rutina prescrita.

## Contexto permitido

El motor puede considerar:

- equipamiento disponible;
- ejercicio preferido declarado;
- ejercicios excluidos explícitamente;
- misma zona/grupo muscular del ejercicio prescrito.

## Limitaciones declaradas

`declaredLimitations` se trata como frontera de seguridad.

Si existe al menos una limitación declarada:

- `humanReviewRequired = true`;
- no se interpreta el texto;
- no se generan sugerencias automáticas;
- no se diagnostica ni se infiere una condición de salud.

Las decisiones de salud quedan fuera de automatización no supervisada.

## Motor

`POST /gym/exercise-substitutions/suggest`

- valida `routineExerciseId` dentro del tenant;
- lee el ejercicio prescrito y catálogo activo del mismo tenant;
- sólo considera alternativas del mismo `muscleGroup`;
- si el ejercicio prescrito no tiene `muscleGroup`, responde `contextInsufficient: true` y no adivina equivalencias;
- filtra exclusiones;
- filtra por equipamiento cuando se declara;
- da prioridad explícita al ejercicio preferido;
- usa categoría/equipamiento como señales secundarias;
- devuelve score, reasons y candidatos;
- nunca aplica la sustitución.

## Ejecución

Cuando el usuario selecciona una sugerencia:

- la rutina original permanece intacta;
- `GymWorkoutSet.routineExerciseId` conserva qué estaba prescrito;
- `performedExerciseId` conserva qué se ejecutó realmente;
- `substitutionReason` conserva razones estructuradas no clínicas;
- el backend vuelve a validar que el ejercicio ejecutado sea activo, del tenant y del mismo grupo muscular.

Series omitidas no registran un ejercicio ejecutado.

## Integración con performance

41/51 atribuye volumen/PR/e1RM al ejercicio **realmente ejecutado** mediante:

`COALESCE(performedExerciseId, prescribedExerciseId)`.

## Límite con 43/51

42/51 no crea ingredientes, alimentos, recetas, macros ni planes de nutrición. 43/51 es el dueño del modelo nutricional por ingrediente.

## QA

- regresión dedicada `erp_ui_gym_contextual_substitutions_42_51.test.mjs`;
- Wave A exige fail-closed ante limitaciones declaradas, provenance prescrito/ejecutado y ausencia de automatización médica/nutricional;
- CI/browser/PostgreSQL sólo son PASS con steps reales del SHA exacto.
