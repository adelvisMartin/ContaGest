# 46/51 · Gimnasio — macros y micronutrientes persistentes

## Objetivo

Persistir composición nutricional explícita por ingrediente y congelar los totales de cada plan al momento de crearlo, sin conversiones de unidad implícitas ni reconstrucciones históricas que puedan cambiar con el tiempo.

## Perfil versionado por ingrediente

`GymIngredientNutritionProfile` es append-only y versionado.

Cada versión define:

- cantidad base;
- unidad base;
- energía kcal;
- proteína g;
- carbohidratos g;
- grasa g;
- fibra g;
- micronutrientes estructurados.

`GymIngredientMicronutrient` conserva:

- clave estable;
- etiqueta;
- cantidad;
- unidad `g | mg | mcg | IU`.

Guardar desde la UI crea una **nueva versión**. No se actualiza ni elimina una versión previa.

## Regla de unidades

46/51 no adivina equivalencias físicas.

Un alimento solo participa en un total cuando:

`mealItem.unit === nutrientProfile.basisUnit`

Ejemplos:

- perfil `100 g` + item `250 g`: calculable;
- perfil `100 g` + item `1 porción`: **no calculable**;
- perfil `100 ml` + item `100 g`: **no calculable**.

No existe conversión silenciosa g↔ml↔unidad↔porción.

## Snapshot del plan

Cuando se crea un plan 44/51, dentro de la misma transacción se ejecuta `createPlanNutrientSnapshot`.

El snapshot:

1. lee ingredientes directos de `GymMealItem`;
2. expande la receta principal desde `GymRecipeItem`;
3. aplica las porciones explícitas de la comida;
4. selecciona la última versión disponible de cada perfil **en ese momento**;
5. suma macros y micronutrientes solo con unidades compatibles;
6. persiste referencias exactas a versiones de perfil;
7. persiste incidencias.

`GymNutritionPlanNutrientSnapshot` es único por plan e inmutable.

## Estados

`complete=true`

Todos los ingredientes principales tenían perfil y unidad compatible. La UI puede mostrar los totales como confiables para ese snapshot.

`complete=false`

Se conserva el snapshot con incidencias como:

- `MISSING_PROFILE`;
- `UNIT_MISMATCH`;
- `INVALID_QUANTITY`.

La UI no presenta los valores parciales como un total confiable.

## Historial

Editar hoy la composición de un ingrediente crea una nueva versión y **no cambia** un plan creado ayer.

Los planes anteriores a 46/51 no reciben un snapshot retroactivo automático; la UI los identifica como “Plan sin snapshot”. No se reconstruye historia con datos actuales.

## UX

- `IngredientNutritionProfilePanel`: edición/versionado de macros y micronutrientes;
- `NutritionSnapshotPanel`: lectura del snapshot persistido y estado completo/incompleto.

## Frontera

46/51 no implementa:

- adherencia;
- cumplimiento;
- registro de comidas consumidas;
- comparación planificado vs realizado.

Eso pertenece a 47/51.

## QA

- regresión dedicada `erp_ui_gym_nutrient_composition_46_51.test.mjs`;
- Wave A exige versionado, snapshot transaccional, cero conversión silenciosa y un solo owner por superficie;
- CI/browser/PostgreSQL solo cuentan como PASS si el SHA exacto ejecuta steps reales.
