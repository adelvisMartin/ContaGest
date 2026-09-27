# Auditoría SQL crudo — #544

## Resultado

La remediación final mantiene el auditor de SQL crudo en modo estricto. No se introducen allowlists de fragmentos de plantilla ni excepciones para interpolación estructural.

## Causa raíz

Los hallazgos provenían de interpolación estructural en call sites que construían consultas con identificadores o fragmentos variables. Aunque algunos valores estaban controlados internamente, el patrón debilitaba la propiedad de seguridad requerida por ContaGest: SQL estructuralmente estático y valores de runtime enlazados como parámetros.

## Remediación final

La solución integrada en #568 elimina esas interpolaciones en los call sites afectados:

- SGF cron usa una sentencia SQL fija.
- CRM scheduler usa una sentencia fija sin columna de estado interpolada.
- Veterinary stock usa formas SQL explícitas para los casos paid/unpaid.
- Gym notifications pasa el mensaje como parámetro enlazado en lugar de interpolarlo en el SQL.

El scanner `audit:raw-sql-security` conserva su política estricta. `config/raw-sql-security-68-75.json` mantiene `approvedDynamicSql` vacío y no incorpora `approvedTemplateFragments`.

## Regresión

La remediación queda cubierta por las regresiones autoritativas introducidas con #568:

- `tests/raw_sql_scheduler_544_regression.test.mjs`
- `tests/gym_notification_raw_sql_544_regression.test.mjs`

## Regla de aceptación

La aceptación de esta reconciliación requiere validar el SHA exacto resultante mediante los workflows y gates reales del repositorio. Un resultado ausente, pendiente o bloqueado no se considera PASS.
