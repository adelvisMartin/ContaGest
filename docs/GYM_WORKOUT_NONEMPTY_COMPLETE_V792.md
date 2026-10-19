# #792 — Evidencia mínima antes de completar entrenamiento

La ruta real `POST /gym/workout-sessions/:id/complete` ya bloqueaba la sesión por tenant con `FOR UPDATE OF s`. Este incremento exige, **dentro de la misma transacción**, al menos una serie registrada para la sesión en estado `completed` o `skipped` antes de pasar `GymWorkoutSession` a `completed`. Si el contador de filas está ausente, es inválido o cero, responde HTTP409 y no escribe un progreso ficticio. Una serie omitida sí representa evidencia explícita de que el usuario revisó/omitió el trabajo; su motivo/auditoría mejorada corresponde al resto del dominio.

No crea nuevos sets, idempotencia de sesiones offline, ni autoriza recomendaciones clínicas. No resuelve reintentos concurrentes entre clientes ni persiste claves de evento por sí solo.

Pruebas `node --test tests/gym_workout_nonempty_complete_v792.test.mjs`. Evidencia focal: ruta real extraída de GitHub ejecutada con tx SQL simulado (no PostgreSQL17); PG17 tenant A/B, navegador, pipeline y experiencia de sesión vacía necesitan QA. #792 OPEN/PARTIAL. Rollback revert 3 archivos, sin DDL. SOURCE_REUSE=NONE.
