# 43/51 · Gimnasio — modelo nutricional por ingrediente

## Objetivo

Eliminar la dependencia del texto libre en la composición de comidas y establecer una autoridad estructurada por ingrediente, sin adelantar el plan alimenticio completo de 44/51 ni la persistencia nutricional detallada de 46/51.

## Autoridades

Se añaden dos entidades canónicas:

- `GymIngredient`: catálogo de ingredientes aislado por tenant;
- `GymMealItem`: vínculo estructurado entre una `GymMeal` y un ingrediente con cantidad, unidad, orden y notas.

`GymMeal.items` se conserva por compatibilidad con datos históricos. Los nuevos writes usan `GymMealItem`; no se destruye ni reinterpreta información legacy.

## Backend

### Catálogo

- `GET /gym/ingredients`: búsqueda por nombre, categoría y estado;
- `POST /gym/ingredients`: alta tenant-scoped;
- `PATCH /gym/ingredients/:id`: edición, archivado y reactivación;
- nombre único por tenant, normalizado con `lower(btrim(name))`;
- no existe DELETE: los ingredientes usados en historial se archivan.

### Plan nutricional

`nutritionSchema.meals[].items[]` ahora exige:

- `ingredientId`;
- `quantity > 0`;
- `unit`;
- notas opcionales.

La creación del plan es atómica:

1. valida cliente del tenant;
2. valida responsable del tenant;
3. valida todos los ingredientes activos del tenant;
4. crea plan;
5. crea comidas;
6. crea `GymMealItem`.

Un fallo en cualquier paso revierte toda la operación.

## Frontend

### IngredientLibraryPanel

Permite:

- crear ingrediente;
- categoría;
- unidad base;
- editar;
- archivar;
- reactivar;
- buscar.

### NutritionMealBuilder

Reemplaza el textarea:

`Tipo | kcal | alimentos`

por un constructor controlado:

- comida;
- hora;
- ingrediente;
- cantidad;
- unidad;
- nota.

No hay parsing por pipes, comas ni formato implícito.

## Compatibilidad y límites

43/51 no incorpora:

- recetas;
- restricciones/preferencias personales;
- cálculo automático de macros;
- micronutrientes;
- adherencia.

Esos puntos pertenecen a 44–47/51.

La composición nutricional detallada por ingrediente se reserva expresamente para 46/51.

## QA

- regresión dedicada `erp_ui_gym_ingredient_model_43_51.test.mjs`;
- Wave A bloquea regreso a `mealLines`, pérdida de tenant isolation o pérdida de `GymMealItem`;
- CI/browser/PostgreSQL sólo se consideran PASS si el SHA exacto ejecuta steps reales.
