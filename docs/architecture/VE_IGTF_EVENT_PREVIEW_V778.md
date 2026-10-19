# #778 — IGTF: contexto de evento y vista previa controlada

Incremento puro en `ve-igtf-event-preview.ts`. Selecciona explícitamente **moneda, medio de pago, tipo de operación y categoría fiscal** (representadas por tokens de identidad). Compara el selector completo con una regla de familia `IGTF` ya revisada y activa, vigente en la fecha y perteneciente al tenant; utiliza el cálculo BigInt/snapshot que ya provee `ve-reviewed-rule-policy.ts`. No presupone qué monedas, medios u operaciones generan IGTF: esa elegibilidad es autoridad de #751/#774 y requiere revisión legal efectiva.

**No hay endpoint de cálculo**, configuración productiva, tasas nacionales predefinidas, pagos, certificados, reversos ni ledger. Los porcentajes en tests son estrictamente sintéticos. La vista previa no es autorización para declarar, recaudar ni contabilizar. El uso futuro deberá derivar `tenantId`, moneda, medio y categoría desde eventos autenticados de backend; no aceptar un objeto `rule` suministrado por el navegador.

Falta integrar fuentes legalmente aprobadas (#751), perfil (#774), roles contables (#785), persistencia de snapshots/aplicabilidad, idempotencia y PG17/E2E con cierres y reversos. **PARTIAL / NO_MERGE / #778 OPEN**. Ningún nuevo motor fiscal ni segunda base de datos.
