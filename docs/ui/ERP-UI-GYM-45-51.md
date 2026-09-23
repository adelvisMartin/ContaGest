# 45/51 · Gimnasio — restricciones y preferencias explícitas

## Objetivo

Añadir restricciones y preferencias nutricionales por cliente sin inferir condiciones clínicas ni modificar automáticamente un plan.

## Autoridad

`GymNutritionRule` relaciona:

- tenant;
- cliente;
- ingrediente canónico de 43/51;
- tipo de regla;
- nota declarada;
- estado activo/archivado;
- actor de creación.

Tipos:

- `allergy` — alergia declarada;
- `intolerance` — intolerancia declarada;
- `exclusion` — ingrediente explícitamente excluido;
- `preferred` — ingrediente preferido.

El sistema no determina si una persona tiene una alergia/intolerancia. Solo conserva lo declarado.

## Comportamiento

Al crear un plan 44/51, el backend reúne:

1. ingredientes directos;
2. ingredientes contenidos en recetas principales;
3. ingredientes contenidos en recetas alternativas.

Después busca reglas activas del mismo cliente.

`allergy | intolerance | exclusion` bloquean el plan cuando existe coincidencia exacta por `ingredientId`.

`preferred` es informativo y nunca selecciona, reemplaza o reordena comidas.

## Tenant isolation

Alta de regla valida dentro de una transacción:

- cliente del tenant;
- ingrediente activo del tenant;
- unicidad tenant + cliente + ingrediente + tipo.

No existe DELETE; se archiva/reactiva con PATCH para conservar historial operacional.

## UX

`NutritionRulesPanel`:

- requiere cliente;
- selecciona ingrediente existente;
- selecciona tipo;
- permite nota explícita;
- lista reglas activas/archivadas;
- permite archivar/reactivar.

La interfaz explica que no hay reescritura automática del plan.

## Frontera

45/51 no implementa:

- cálculo/persistencia detallada de macros o micronutrientes: 46/51;
- adherencia o consumo real: 47/51.

## QA

- regresión `erp_ui_gym_nutrition_rules_45_51.test.mjs`;
- Wave A exige un único owner, tenant isolation, expansión de ingredientes de recetas y bloqueo fail-closed;
- CI/browser/PostgreSQL solo son PASS si el SHA exacto ejecuta steps reales.
