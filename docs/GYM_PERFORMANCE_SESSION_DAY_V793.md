# #793 — Coherencia de fecha en informe de progreso Gym

El reporte `GET /gym/performance` filtra sesiones completadas usando `GymWorkoutSession.startedAt`, pero previamente agregaba `dailyTrend` por `GymWorkoutSet.recordedAt`. Un usuario podía comenzar el entrenamiento antes de medianoche y registrar la serie después, resultando en una tendencia fuera del periodo consultado.

Ahora tanto `dailyTrend` como `trainingDays` agrupan mediante `gymPerformanceSessionDay(startedAt)` en UTC, consistente con el WHERE existente; `lastPerformedAt` sigue preservando el timestamp real de serie. No reescribe eventos ni cambia la fecha seleccionada del SQL. **No es diagnóstico ni cálculo clínico**, es trazabilidad temporal del entrenamiento.

Tests: `node --test tests/gym_performance_session_day_v793.test.mjs`. Sigue pendiente el QA del report completo en PostgreSQL17 tenant A/B, volúmenes reales/boundary, frontend responsivo y CI. #793 permanece OPEN/PARTIAL. Rollback revert 3 archivos sin DDL. SOURCE_REUSE=NONE.
