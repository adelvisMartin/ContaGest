# 46/51 · Gimnasio — macro/micronutrientes persistentes

## Objetivo

Persistir composición nutricional por ingrediente y objetivos nutricionales explícitos por plan, manteniendo una sola autoridad y sin inventar conversiones, nutrientes ni reglas clínicas.

## Autoridad

### Ingrediente canónico

Se extiende `GymIngredient` con composición nutricional persistente:

- `nutrientBasisQuantity`;
- `nutrientBasisUnit`;
- `energyKcal`;
- `proteinG`;
- `carbsG`;
- `fatG`;
- `fiberG`;
- `micronutrients` JSONB;
- `nutritionSource`;
- `nutritionSourceRef`.

La composición pertenece al mismo ingrediente de 43/51. No se crea un segundo catálogo nutricional.

### Objetivos del plan

`GymNutritionPlan` ya persistía objetivos globales de proteína, carbohidratos y grasa. 46/51 conserva esos campos y añade:

- `fiberG`;
- `micronutrientTargets` JSONB.

Son objetivos declarados por el responsable del plan; ContaGest no los recomienda ni calcula automáticamente.

## Procedencia y seguridad

Cuando un ingrediente tiene composición nutricional, backend exige:

1. cantidad base explícita;
2. unidad base explícita;
3. procedencia explícita.

Los micronutrientes no usan un catálogo inventado por ContaGest. Se persisten únicamente las claves presentes en la fuente informada, cada una con `amount + unit`.

No se infieren diagnósticos, restricciones clínicas ni recomendaciones micronutricionales.

## Derivación de composición

`GET /gym/nutrition/:id/composition` deriva composición del plan desde:

- ingredientes directos de `GymMealItem`;
- ingredientes de la receta principal de cada comida.

No usa alternativas para el total base del plan.

La regla de conversión es deliberadamente fail-closed:

- solo se calcula cuando `item.unit === ingredient.nutrientBasisUnit`;
- no se asume que gramos, mililitros, unidades o porciones sean convertibles;
- los ingredientes sin base suficiente o con unidad distinta aparecen en `unresolvedItems`;
- la respuesta expone `conversionPolicy: exact-basis-unit-only`.

## UX

### Catálogo de ingredientes

`IngredientLibraryPanel` permite registrar:

- base nutricional;
- energía;
- proteína;
- carbohidratos;
- grasa;
- fibra;
- micronutrientes dinámicos;
- procedencia;
- referencia de procedencia.

### Plan nutricional

`NutritionTargetFields` permite persistir:

- calorías;
- proteína;
- carbohidratos;
- grasa;
- fibra;
- agua;
- objetivos micronutricionales explícitos.

La interfaz indica que estos objetivos no son calculados ni recomendados automáticamente.

## Compatibilidad

- ingredientes históricos siguen válidos con composición NULL;
- planes históricos siguen válidos con `fiberG = NULL` y `micronutrientTargets = {}`;
- los campos históricos de macro en `GymMeal` no se convierten en segunda autoridad para 46/51;
- recetas, restricciones 45/51 y shopping list 44/51 permanecen sin cambio de contrato.

## Frontera

46/51 no implementa:

- adherencia/consumo real: 47/51;
- automatización clínica;
- recomendaciones dietéticas;
- conversión automática de unidades;
- enriquecimiento externo automático de FoodData.

## QA

- regresión dedicada: `tests/erp_ui_gym_nutrients_46_51.test.mjs`;
- Wave A bloquea pérdida de persistencia, provenance, objetivos o política de unidad exacta;
- CI/browser/PostgreSQL solo son PASS cuando el SHA exacto ejecuta steps reales.
