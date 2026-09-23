# 44/51 · Gimnasio — plan alimenticio completo

## Objetivo

Convertir el catálogo de ingredientes de 43/51 en un plan alimenticio operativo de **7, 14 o 28 días**, con recetas reutilizables, comidas ordenadas, porciones, preparación, alternativas explícitas y una lista de compras derivada.

44/51 mantiene fuera de alcance las restricciones/preferencias de 45/51, la composición nutricional detallada de 46/51 y la adherencia de 47/51.

## Compatibilidad semanal

La primera migración de 44/51 añade a `GymMeal`:

- `dayOfWeek` nullable para conservar registros legacy sin inventar fecha;
- `sortOrder` explícito.

La migración completa añade `dayIndex` para representar el día absoluto dentro del horizonte 7/14/28. Al existir `dayIndex`, la unicidad se aplica a:

`nutritionPlanId + dayIndex + sortOrder`

y se elimina el índice semanal previo, porque reutilizar lunes/martes en semanas 2–4 no puede provocar colisiones.

## Recetas

`GymRecipe` y `GymRecipeItem` permiten reutilizar combinaciones de ingredientes de 43/51.

La creación de receta:

- valida ingredientes activos del mismo tenant;
- se ejecuta en transacción;
- usa lock advisory por tenant/nombre;
- conserva porciones y preparación;
- no calcula macros ni micronutrientes.

## Plan completo

`GymNutritionPlan.durationDays` sólo admite 7, 14 o 28.

Cada comida nueva conserva:

- `dayIndex` y `dayOfWeek`;
- orden;
- tipo/hora;
- receta principal **o** ingredientes directos, nunca ambas autoridades a la vez;
- porciones;
- preparación;
- alternativas de receta con sus propias porciones;
- notas.

El backend valida que el día pertenezca al horizonte y que `dayOfWeek=((dayIndex-1)%7)+1`.

## Alternativas

`GymMealAlternative` registra alternativas explícitas. 44/51 no decide automáticamente qué alternativa usar y no interpreta alergias, preferencias o condiciones de salud.

## Lista de compras

`GET /gym/nutrition/:id/shopping-list` es read-only y deriva cantidades de:

1. ingredientes directos de comidas principales;
2. ingredientes de la receta principal, escalados por porciones.

Las alternativas se excluyen deliberadamente para no sumar simultáneamente opciones mutuamente excluyentes.

## UX

- `CompleteMealPlanBuilder`: horizonte 7/14/28, día, orden, comida, receta/ingredientes, porciones, preparación y alternativas;
- `NutritionRecipeLibrary`: creación y lectura de recetas;
- `NutritionShoppingListPanel`: lista de compras para un plan persistido;
- `FitnessNutritionQuickTool` queda sólo como sugerencia/copiar. No puede saltarse el modelo canónico guardando texto libre.

## Fronteras

44/51 no implementa:

- **45/51**: alergias, restricciones y preferencias;
- **46/51**: macros/micronutrientes persistentes por ingrediente;
- **47/51**: adherencia/consumo real.

## QA

- `tests/erp_ui_gym_complete_meal_plan_44_51.test.mjs`;
- Wave A exige owner único, horizonte, recipes, alternativas, shopping list read-only y compatibilidad legacy;
- CI/browser/PostgreSQL sólo son PASS cuando el SHA exacto ejecuta steps reales.
