# 44/51 · Gimnasio — plan alimenticio completo

## Objetivo

Extender el modelo por ingrediente de 43/51 a un plan alimenticio utilizable de punta a punta: horizonte real de 7, 14 o 28 días, orden semanal, recetas reutilizables, porciones, preparación, alternativas explícitas y lista de compras derivada.

## Autoridades

44/51 conserva las autoridades de 43/51:

- `GymIngredient` para ingredientes tenant-scoped;
- `GymMealItem` para ingredientes directos de una comida.

Añade:

- `GymRecipe`;
- `GymRecipeItem`;
- `GymMealAlternative`.

No se duplica el catálogo de ingredientes.

## Calendario y horizonte

`GymNutritionPlan.durationDays` acepta únicamente 7, 14 o 28.

Cada nueva comida conserva:

- `dayIndex`: día absoluto dentro del horizonte;
- `dayOfWeek`: 1=Lunes ... 7=Domingo;
- `sortOrder`: posición explícita dentro del día;
- tipo/hora;
- receta o ingredientes directos;
- porciones;
- preparación;
- alternativas;
- notas.

El backend comprueba que `dayOfWeek = ((dayIndex - 1) % 7) + 1` y que no se repitan posiciones dentro del mismo día.

Las comidas legacy continúan admitiendo `dayIndex/dayOfWeek = NULL`; no se les inventa calendario.

## Recetas

Una receta contiene:

- nombre único por tenant;
- porciones base;
- preparación;
- uno o más `GymRecipeItem`.

Los ingredientes se revalidan dentro de la transacción y deben estar activos y pertenecer al tenant.

## Creación del plan

La operación de alta es atómica:

1. valida cliente;
2. valida responsable;
3. valida ingredientes directos;
4. valida recetas principales y alternativas;
5. crea el plan;
6. crea comidas;
7. crea ingredientes directos;
8. crea alternativas.

Una comida debe tener una receta o ingredientes directos.

## Lista de compras

`GET /gym/nutrition/:id/shopping-list` deriva la lista desde las comidas principales:

- suma ingredientes directos;
- expande ingredientes de recetas según porciones;
- agrupa por ingrediente + unidad;
- no persiste agregados;
- no suma alternativas para evitar inflar compras.

## UX

La vertical Nutrición compone exactamente un dueño de cada superficie:

- `IngredientLibraryPanel`;
- `NutritionRecipeLibrary`;
- `CompleteMealPlanBuilder`;
- `NutritionShoppingListPanel`.

El builder cubre 7/14/28 días, día real, orden, receta, porciones, preparación, ingredientes directos y alternativas.

## Compatibilidad

El builder anterior de 43/51 queda supersedido por `CompleteMealPlanBuilder`; sus invariantes por ingrediente siguen cubiertos por la regresión 43 y Wave A.

## Frontera

44/51 no implementa:

- alergias, restricciones o preferencias: 45/51;
- persistencia/cálculo completo de macros y micronutrientes: 46/51;
- adherencia o consumo real: 47/51.

Las alternativas son explícitas; no se seleccionan automáticamente por restricciones.

## QA

- `erp_ui_gym_complete_meal_plan_44_51.test.mjs`;
- regresión 43 actualizada para el builder sucesor;
- Wave A exige autoridades, horizonte, recetas, lista de compras y ausencia de ciclo DOM imperativo;
- CI/browser/PostgreSQL solo son PASS cuando el SHA exacto ejecuta steps reales.
