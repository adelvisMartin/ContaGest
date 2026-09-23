# 41/51 · Gimnasio · Historial y performance

## Objetivo

Derivar historial de rendimiento desde `GymWorkoutSession` + `GymWorkoutSet` sin crear una segunda fuente de verdad.

## Endpoint

`GET /gym/performance?memberId=...&from=YYYY-MM-DD&to=YYYY-MM-DD`

- requiere `gym.manage`;
- valida tenant del cliente;
- rango máximo: 366 días;
- por defecto: últimos 90 días;
- consume sólo sesiones `completed`.

## Métricas

### Resumen

- sesiones completadas;
- días distintos con entrenamiento;
- frecuencia de sesiones por semana;
- series prescritas en las rutinas ejecutadas;
- series completadas;
- series omitidas;
- adherencia de series = completadas / prescritas, acotada a 100%;
- volumen total = suma de `loadKg × reps` para series completadas con ambos valores.

### PRs por ejercicio

- mayor carga registrada;
- mayor número de repeticiones;
- mejor e1RM estimado;
- volumen total;
- series completadas/omitidas.

### e1RM

Se usa la fórmula Epley:

`loadKg × (1 + reps / 30)`

Sólo se calcula cuando:

- carga > 0;
- reps entre 1 y 12.

Se etiqueta siempre como **estimación** y nunca como 1RM medido.

### Tendencias

- volumen por día;
- volumen por ejercicio;
- volumen por grupo muscular;
- frecuencia dentro del período.

La UI muestra gráficas accesibles derivadas del payload y permite seleccionar período.

## Autoridad

No se persisten agregados, PRs, volumen ni e1RM. Todos se recalculan desde sesiones/series canónicas para evitar drift.

## Límite con 42/51

41/51 no selecciona ejercicios alternativos ni hace sustituciones contextuales. 42/51 será responsable de ese comportamiento.

## QA

- regresión dedicada `erp_ui_gym_performance_history_41_51.test.mjs`;
- Wave A exige endpoint read-only, fórmula/condición e1RM, métricas y una sola composición declarativa;
- CI/browser/PostgreSQL sólo son PASS con steps reales del SHA exacto.
