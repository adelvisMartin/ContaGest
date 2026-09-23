# 44/51 · Gimnasio — plan alimenticio semanal completo

## Objetivo

Convertir el modelo por ingrediente de 43/51 en una programación alimentaria semanal explícita, ordenada y con vigencia, sin inventar información para registros históricos.

## Programación canónica

Cada nueva comida conserva:

- `dayOfWeek`: 1=Lunes ... 7=Domingo;
- `sortOrder`: posición explícita dentro del día;
- tipo de comida;
- hora;
- ingredientes estructurados de 43/51;
- kcal manuales existentes;
- notas.

La UI reutiliza `FITNESS_WEEK_DAYS`, la misma convención semanal de rutinas.

## Persistencia

`GymMeal` añade:

- `dayOfWeek integer NULL`;
- `sortOrder integer NOT NULL DEFAULT 1`.

`dayOfWeek` es nullable únicamente para compatibilidad histórica: una comida legacy sin día conocido permanece sin día en lugar de recibir un valor fabricado.

Para nuevas comidas, el API exige día 1–7 y orden 1–50.

Un índice parcial único impide dos comidas con la misma posición dentro del mismo día y plan.

## Vigencia

El formulario expone fecha de inicio y fin.

Si ambas existen, el backend rechaza un fin anterior al inicio.

## UX

`NutritionMealBuilder` presenta los siete días y permite:

- agregar comida por día;
- subir/bajar dentro del día;
- duplicar;
- eliminar;
- definir hora;
- asociar ingredientes, cantidades y unidades.

No existe parser por pipes/comas.

## Frontera

44/51 no implementa:

- alergias/restricciones/preferencias: 45/51;
- composición persistente de macros/micronutrientes: 46/51;
- adherencia/registro de consumo: 47/51.

## QA

- regresión dedicada `erp_ui_gym_complete_meal_plan_44_51.test.mjs`;
- Wave A exige orden semanal, fechas y compatibilidad legacy;
- CI/browser/PostgreSQL solo son PASS con steps reales sobre el SHA exacto.
