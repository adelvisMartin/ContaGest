# #637 — Atomicidad de comandos de asientos manuales (parcial)

Hallazgo en main: editar/eliminar asiento comprobaba `posted` fuera de una transacción y postear comprobaba periodo/lineas antes de entrar en su transacción. Intercalaciones de peticiones podían usar verificaciones obsoletas.

Se introduce `SELECT ... FOR UPDATE` parametrizado y limitado por `tenantId + entryId` dentro de la transacción de **edit/delete/post**. Revalidar estado, balance Decimal y vigencia contable bajo el lock, y hacer el cambio ahí mismo. Postear asiento manual ahora exige que cada cuenta exista en `ChartAccount` del tenant, esté activa y permita asientos. No se modifican asientos generados por ventas/compras ni se establecen códigos de cuentas fijos; se conserva HTTP/API público y auditoría de posting en la transacción.

## Incremento 2026-10-21 — reversos bajo el mismo lock de asientos

El servicio `reverseLedgerEntry` también adquiere `SELECT ... FOR UPDATE` sobre `LedgerEntry` filtrada por `tenantId + entryId` **dentro** de `prisma.$transaction`. La lectura completa, la comprobación del lifecycle, la validación de periodo de destino mediante el mismo `tx`, la inversión Decimal de líneas, la creación y el audit log quedan en una unidad atómica. Se conserva el error HTTP 409 ante `P2002` (reintento/duplicidad), actor requerido y contrato de entrada/salida HTTP existente.

Motivo: antes se leía el original y se consultaba periodo fuera de la transacción; un cambio concurrente podía invalidar la autorización o el estado observado. El row lock serializa reversos con edit/delete/post del mismo asiento. No concede escritura por CRUD ni altera la restricción PostgreSQL #628 de reverso único. Un cierre concurrente de periodo y su garantía integral dependen de los triggers/constraints canónicos y de pruebas en PostgreSQL17; usar el `tx` por sí solo **no demuestra aislamiento serializable**.

Evidencia preliminar de esta revisión: inspección fuente RED→GREEN contra main, siete escenarios de la función exacta con dependencias simuladas (incluidos duplicado y periodo cerrado), más regresiones estáticas Node en `tests/manual_ledger_posting_authority_v637.test.mjs`. **No** hay checkout íntegro ni PostgreSQL17 disponibles en este entorno para ejecutar `npm ci`, tests de base de datos/API, RLS A/B o concurrencia real. La evidencia requerida de aceptación continúa como `NOT_EXECUTED`; el ticket #637 sigue `OPEN/PARTIAL` hasta cerrar los demás owners financieros y gates.

**Alcance limitado**: el incremento original no abordaba reversos (ahora cubiertos por el bloqueo transaccional señalado arriba) ni el cierre concurrente de periodos, ni centraliza aún sales/purchases/banking/payroll/FX. Es posible que borradores antiguos con cuentas no sincronizadas al catálogo ya no puedan contabilizarse: decisión fail-closed de seguridad contable, requiere validación de compatibilidad y plan de onboarding antes de merge. Los nuevos locks pueden interactuar con políticas RLS; PostgreSQL 17 y pruebas multi-tenant/concurrencia son obligatorias.

Unit test puro para tenant/cuentas postables; PG17 dos sesiones para edit↔post, delete↔post, posted inmutable, periodo cerrado, recálculo, exact Decimal/retries y RLS = NOT_EXECUTED hasta entorno real. **PARTIAL / NO MERGE / ticket #637 OPEN**.
