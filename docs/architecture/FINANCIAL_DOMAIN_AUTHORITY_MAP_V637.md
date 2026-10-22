# #637 · Autoridad de comandos financieros — mapa vivo de migración

**Corte de inspección:** `main@9c3afa4d0bc6aa2a723e302326260e8df25e7941`, 2026-10-21. Este mapa es una inspección de código, **no prueba de ejecución PG17**, ni afirma cobertura completa de cada endpoint. Dueño del ticket: [#637](https://github.com/adelvisMartin/ContaGest/issues/637). Contrato objetivo: **route (HTTP/RBAC) → application/domain service (transacción/reglas) → repository/Prisma → PostgreSQL**.

## Mapa por comando y autoridad visible

| Comando/familia | Entrada inspeccionada | Autoridad actual comprobada | Brecha / siguiente refactor seguro |
| --- | --- | --- | --- |
| Asiento manual: crear/post/editar/borrar/reversar | `backend/src/modules/accounting/accounting.routes.ts` | `accounting.service.ts` contiene lifecycle, sumas Decimal, periodo, post y compensación; `manual-posting-policy.ts` valida cuentas del tenant | Este PR integra **reversar** al lock/tx usado por edit/delete/post (#1157). Caracterizar concurrencia con PG17, account role y post/reverse antes de cierre. |
| Cierre de período contable | `accounting.routes.ts` | La ruta todavía consulta `closingPeriod`, decide transición y hace `prisma.closingPeriod.update` | Mover a servicio contable compartido, actor requerido, bloqueo/revalidación en transacción, auditoría en tx y protección ante cierre↔posting. |
| Venta y anulación | `backend/src/modules/sales/sales.routes.ts` | Rutas ejecutan orquestación; usan `runFinancialIdempotentMutation`, `accounting.service.ts` y `document-sequence.service.ts` | Extraer comandos `issue/cancel` a servicio de ventas y separar venta inventario/servicio mediante plantillas/roles versionados. No refactorizar el posting global sin #785/#751. |
| Compra y anulación | `backend/src/modules/purchases/purchases.routes.ts` | Rutas aún orquestan y consumen `purchaseInvoiceLinesForLedger`; tienen idempotencia y secuencia compartidas | Mover a servicio de compras; **no considerar toda compra COGS**: clasificar inventario vs gasto/servicio vs activo/prepago; usar plantillas postables del tenant antes de journal. |
| CxP / revisión de documentos | `payables.routes.ts` | `payables.service.ts` contiene transacciones e interfaz de operaciones | Integrar caracterización de transiciones, source/effect identity, auditoría y reconciliación CxP↔ledger #643, sin reimplementar el servicio existente. |
| Movimiento bancario / conciliación | `banking.routes.ts` y `bank-reconciliation.routes.ts` | `bank-reconciliation.service.ts` es dueño de reconciliación específica; `banking.routes.ts` aún actualiza `BankMovement` directamente en `PATCH /movements/:id/reconcile` | Centralizar conciliación manual, reversal/correction y exact effect keys sin romper rutas; refactor del PATCH con lock/tx y A/B negatives. |
| Nómina | `backend/src/modules/payroll/payroll.routes.ts` | La ruta crea recibos y actualiza estados de `PayrollPeriod`/recalcula totales directamente | Introducir servicio de nómina con transiciones atómicas, auditoría en transacción, prevención de doble devengo y posting temporal correcto. |
| Fiscal / períodos / comprobantes | `backend/src/modules/fiscal/fiscal.routes.ts` | Cierre e emisión usan idempotencia compartida; `/reopen-period` hace `prisma.closingPeriod.update` directamente | Extraer cierre/reapertura/emisión a servicios fiscales, coordinar contratos #629/#751, permisos y auditoría transaccionales, no inventar tasas. |
| FX / tasas | `backend/src/modules/currency/currency.routes.ts` y `fx.repository.ts` | Existen rutas y repositorio de tipos de cambio; `shared/financial/decimal.ts` es autoridad de precisión | Auditar comando de creación/selección de tasa, vigencia, source y snapshot FX por documento; no asignar servicio no observado. |
| CRUD general | `backend/src/modules/crud.factory.ts`, `crud-policy.ts` | Allowlist actual restringe modelos: `client`, `supplier`, `product`, `bankAccount`, `taxPeriod`; elimina y actualiza operaciones financieras reservadas | Mantener prohibición de mutar estado irreversible desde factory; auditoría de nuevos consumidores antes de permitir modelos/campos. |

## Invariantes y dueños transversales

- **Dinero exacto:** `backend/src/shared/financial/decimal.ts` y `accounting.service.ts`; jamás `Number` como autoridad de persistencia monetaria.
- **Idempotencia:** `backend/src/shared/services/financial-idempotency.service.ts` gestiona claves de request; **la identidad del efecto contable** y la carrera de dos operaciones sin clave exigen constraints + tests PG y análisis por comando.
- **Ledger y periods:** `accounting.service.ts` para estados y períodos; #628 para guardas/triggers/única compensación DB; #629 para gates fiscales; un check previo en route **no es suficiente**.
- **Cuentas contables:** `chart-accounts/semantic-posting-policy.ts` resuelve roles semánticos activos/tenant; #785. Requiere evento → policy/template → cuentas del tenant → ledger; no crear nuevas cuentas nacionales fijas.
- **Aislamiento/auditoría:** `requireTenant`/RBAC y filtros tenant en servicios, RLS PostgreSQL y audit actor/correlation dentro de tx para acciones irreversibles. `writeAudit` fuera de tx puede registrar un resultado desalineado después de error/reintento.
- **Error estable:** conservar HTTP y códigos actuales; introducir catálogo común solo después de caracterizar consumidores.

## Evidencia mínima para retirar #637 del backlog de implementación

1. Inventario exhaustivo de cada comando crítico con un **solo** servicio dueño, efecto y clave de idempotencia.
2. Refactors de lotes pequeños, con characterizations de contratos HTTP, consecuencias contables, tenant A/B y diferencias de política por evento.
3. PostgreSQL17 real: cierre concurrente vs post/reverse, retries dos sesiones, claves de efectos duplicadas, periodos, FX, rollback y `ΣDebe=ΣHaber`; QA/API, RLS y reinicio.
4. `#643` reconciliación del dataset transversal; evidencia de `main` exact-SHA, build/typecheck y gates locales. Mantener #637 abierto mientras existan estas brechas.

El incremento actual **solo** cubre atomicidad de reverso, regresión estructural y este mapa. No convertir `MERGED`, mocks o código revisado en `PASS` de contabilidad real.

## Incremento de cierre contable 2026-10-22 (branch multi-ticket)

`POST /closing-periods/:id/close` delega a `closeAccountingPeriod` en `accounting.service.ts`. La transición de la fila `ClosingPeriod` está bajo `FOR UPDATE` por tenant/ID, update condicionado a `open` y auditoría dentro de la misma transacción. Un actor ausente falla cerrado. **No certifica** serialización cierre↔post: los writers de asientos aún deben coordinar bloqueo de período y necesitan PostgreSQL17 dos sesiones, prueba multi-tenant/RLS y contrato API ejecutado. El alta de períodos y otros comandos siguen en rutas. No cerrar #637.

## Close/post advisory serialization — 2026-10-22

Se unificó el lock transaccional `pg_advisory_xact_lock(hashtextextended('cg:ledger-period:v1:<tenant>:<period>',0))` para el `createAccountingPeriod`, `closeAccountingPeriod` y `assertPeriodOpen(...,tx)` usado por contabilizaciones manuales y flujos sales/purchases. El lock cubre período aún sin fila y se mantiene hasta COMMIT/ROLLBACK. `assertPeriodOpen(...,prisma)` permanece sólo como lectura informativa: **ningún escritor puede interpretarla como barrera transaccional**. La creación y auditoría del período también son atómicas. Atención: otros escritores no cubiertos y cierres de módulo `all` podrían requerir locks equivalentes; hace falta test real PG17 con dos sesiones y dos tenants para cerrar DoD.
