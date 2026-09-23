# 43/51 · GYM — Modelo nutricional por ingrediente

## Objetivo

Sustituir el modelo nutricional basado en texto libre por una base estructurada y reutilizable de:

- alimentos;
- ingredientes;
- recetas;
- macronutrientes por 100 g;
- totales de receta y valores por porción.

43/51 no construye todavía el plan alimenticio completo del cliente. Esa composición corresponde a 44/51.

## Autoridades

### GymFood
Catálogo tenant-scoped.

Campos principales:
- nombre y marca;
- fuente manual o USDA;
- sourceRef/FDC opcional;
- calorías;
- proteína;
- carbohidratos;
- grasas;
- fibra;
- estado activo/archivado.

Los nutrientes se expresan por 100 g.

### GymRecipe
Receta reusable:
- nombre;
- número de porciones;
- instrucciones;
- autor;
- lifecycle activo.

### GymRecipeIngredient
Relaciona una receta con un alimento y gramos exactos.

Una receta no duplica el mismo alimento: se modifican los gramos del ingrediente existente.

## Cálculo

Los totales de receta no se aceptan desde el cliente.

Backend deriva:

`nutrienteIngrediente = nutrientePor100g × gramos / 100`

y suma:
- kcal;
- proteína;
- carbohidratos;
- grasas;
- fibra.

`perServing` se deriva dividiendo por el número de porciones.

## Concurrencia e integridad

- alimento/receta siempre filtrados por tenant;
- índices únicos por tenant;
- receta toma advisory lock por tenant + nombre;
- todos los foodId se revalidan activos y dentro del mismo tenant antes de insertar;
- FK foodId usa RESTRICT para no destruir provenance de recetas;
- no se aceptan totales calculados por cliente.

## USDA

La UI reutiliza FoodData Central mediante el proxy server-side ya existente. El cliente puede tomar un resultado USDA para precargar el formulario, pero el alimento importado conserva source=`usda` + sourceRef/FDC.

La clave USDA permanece fuera del navegador.

## UX

`NutritionIngredientLibrary.jsx` ofrece:
- búsqueda USDA;
- alta manual/importada de alimento;
- macros explícitos por 100 g;
- constructor de receta;
- gramos por ingrediente;
- total de receta;
- resumen por porción;
- estados empty/loading/error/disabled.

## Frontera del roadmap

No implementa todavía:
- 44/51 plan alimenticio completo/semanal;
- 45/51 restricciones/preferencias;
- 46/51 micronutrientes persistentes;
- 47/51 adherencia.

## QA

- `erp_ui_gym_ingredient_model_43_51.test.mjs`;
- Wave A fail-closed;
- migración explícita;
- source-level verification exact-SHA.

Browser/PostgreSQL/typecheck/build sólo cuentan como PASS si ejecutan steps reales sobre el SHA candidato.
