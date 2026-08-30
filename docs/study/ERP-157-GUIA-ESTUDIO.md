# Guía de estudio — ERP #157

## Latencia y percentiles

P50 es la mediana; P95 indica que 95% de las observaciones son iguales o más rápidas; P99 muestra la cola lenta. Para UX, sólo mirar el promedio puede ocultar problemas reales.

## Cold vs warm

Cold incluye arranque/caches vacíos. Warm mide navegación con recursos ya disponibles. Ambos importan.

## Capacity

No basta medir una tabla vacía. Se prueban 100, 1.000 y 10.000 filas, imports, navegación repetida y sesiones largas.

## Memory growth

Una app puede sentirse rápida al inicio y degradarse tras horas. El crecimiento sostenido de heap es una señal de posible leak.

## Throughput

Cantidad de requests procesadas por segundo dentro de un error rate y latencia aceptables.

## Presupuesto provisional

Los números iniciales sirven como guardrail, no como verdad empírica. Después de suficientes mediciones se puede ajustar el baseline, dejando registrada la razón.

## Preguntas

1. ¿Por qué P95 aporta más que un promedio?
2. ¿Qué diferencia existe entre cold y warm?
3. ¿Por qué una tabla de 10.000 filas forma parte del capacity QA?
4. ¿Qué indica un heap que crece después de cada navegación?
5. ¿Por qué una medición sin SHA/entorno es débil como evidencia?
