# 43/51 · Gimnasio · Modelo nutricional por ingrediente

## Objetivo

Reemplazar macros “mágicos” por comida por un snapshot estructurado y trazable de ingredientes, sin convertir la UI en autoridad clínica ni romper planes legacy.

## Persistencia

Se reutiliza `GymMeal.items` JSONB.

Cada ingrediente estructurado conserva:

- `kind: ingredient`;
- nombre;
- cantidad en gramos;
- base nutricional explícita (`basisGrams`);
- fuente `manual | usda_fdc`;
- FDC ID cuando aplica;
- tipo de dato USDA;
- descripción de fuente;
- timestamp del snapshot;
- nutrientes de la base: energía, proteína, carbohidratos, grasa, fibra, sodio, potasio, calcio e hierro.

No se crea una segunda tabla de alimentos en 43/51.

## Cálculo autoritativo

Para cada ingrediente:

`valor_porción = valor_base × amountG / basisGrams`

El backend deriva y persiste calorías, proteína, carbohidratos y grasa de la comida. La previsualización React es sólo UX y está etiquetada como no autoritativa.

Las comidas legacy con `items: string[]` siguen aceptadas. Una comida no puede mezclar strings legacy e ingredientes estructurados porque eso produciría totales parciales.

## USDA FoodData Central

La búsqueda sigue pasando por `/api/fooddata`; la clave nunca llega al navegador.

Antes de agregar un ingrediente USDA, la UI solicita el detalle por FDC ID. En 43/51 la autoimportación se limita a Foundation y SR Legacy con snapshot de base 100 g. Otros tipos siguen visibles para consulta, pero requieren ingreso manual con base explícita.

Esta decisión sigue la documentación USDA: Foundation Foods reporta nutrientes en base 100 g de porción comestible y las porciones se derivan con la relación `V × W / 100`.

## Atomicidad y tenancy

Crear un plan nutricional ahora:

- valida que el cliente pertenezca al tenant activo;
- valida el instructor cuando exista;
- crea plan + comidas dentro de `prisma.$transaction`;
- si una comida falla, no queda un plan parcial;
- no confía en macros enviados por el cliente cuando existen ingredientes estructurados.

## Límites

43/51 no:

- prescribe dietas terapéuticas;
- diagnostica condiciones;
- calcula necesidades clínicas;
- interpreta alergias/enfermedades;
- reemplaza al profesional de nutrición;
- elimina compatibilidad con planes históricos.

El bloqueo de riesgo clínico del generador rápido existente se conserva.

## QA

- regresión dedicada `erp_ui_gym_ingredient_nutrition_43_51.test.mjs`;
- Wave A falla si desaparecen provenance, base explícita, cálculo server-side o tenancy;
- CI/browser/PostgreSQL sólo son PASS cuando ejecutan steps reales sobre el SHA exacto.
