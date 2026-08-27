# Control Hípico — Shadow Evaluation (#111)

Una predicción shadow se conserva por `source message + parserVersion + schemaVersion`; reprocesar con una versión nueva crea otra evidencia y no reescribe la original.

## Match

`compareShadowPrediction()` distingue `exact`, `partial`, `mismatch` y `unresolved`, comparando de forma estable intent/entities/amount/participant/board. El diff conserva predicted vs actual por campo.

## Evidencia durable

- `hipico_shadow_prediction_versions`: predicciones append-only con payload/hash/versiones.
- `hipico_shadow_actuals`: actual posterior, score/diff y estado de revisión.
- el trigger de predicciones prohíbe UPDATE/DELETE;
- si existe la tabla legacy `hipico_shadow_evaluations`, un trigger congela el `predicted_payload` inicial para que su actual `ON CONFLICT DO UPDATE` no reescriba la historia.

## Métricas y promoción

El resumen separa resolved/unresolved, exact/partial/mismatch y critical mismatch rate. Los thresholds se definen **antes** de medir. El helper `assessShadowPromotion()` sólo puede declarar `eligibleForReview`; `autoPromote` es siempre `false`.

Mínimos iniciales: 200 casos resueltos, exact rate >= 98% y cero critical mismatch. Un porcentaje global nunca habilita escritura real si existen errores monetarios críticos o casos pendientes de revisión.

## Versionado

El corpus #109 fija expected-vs-actual del parser. #111 añade persistencia de múltiples versiones para que comparar parser vN vs vN+1 no cambie la evidencia de vN.
