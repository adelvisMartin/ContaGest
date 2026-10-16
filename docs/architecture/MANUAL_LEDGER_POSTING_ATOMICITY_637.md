# #637 — Atomicidad de comandos de asientos manuales (parcial)

Hallazgo en main: editar/eliminar asiento comprobaba `posted` fuera de una transacción y postear comprobaba periodo/lineas antes de entrar en su transacción. Intercalaciones de peticiones podían usar verificaciones obsoletas.

Se introduce `SELECT ... FOR UPDATE` parametrizado y limitado por `tenantId + entryId` dentro de la transacción de **edit/delete/post**. Revalidar estado, balance Decimal y vigencia contable bajo el lock, y hacer el cambio ahí mismo. Postear asiento manual ahora exige que cada cuenta exista en `ChartAccount` del tenant, esté activa y permita asientos. No se modifican asientos generados por ventas/compras ni se establecen códigos de cuentas fijos; se conserva HTTP/API público y auditoría de posting en la transacción.

**Alcance limitado**: este refactor no cambia el manejo de reversos ni el cierre concurrente de periodos, ni centraliza aún sales/purchases/banking/payroll/FX. Es posible que borradores antiguos con cuentas no sincronizadas al catálogo ya no puedan contabilizarse: decisión fail-closed de seguridad contable, requiere validación de compatibilidad y plan de onboarding antes de merge. Los nuevos locks pueden interactuar con políticas RLS; PostgreSQL 17 y pruebas multi-tenant/concurrencia son obligatorias.

Unit test puro para tenant/cuentas postables; PG17 dos sesiones para edit↔post, delete↔post, posted inmutable, periodo cerrado, recálculo, exact Decimal/retries y RLS = NOT_EXECUTED hasta entorno real. **PARTIAL / NO MERGE / ticket #637 OPEN**.
