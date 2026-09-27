# ADR — Reconciliación financiera transversal #559

## Estado

Aceptado para el gate de ingeniería de ContaGest. Este ADR no cambia reglas fiscales ni crea una segunda autoridad financiera.

## Problema

Los subdominios ya poseen controles propios —Decimal, idempotencia, ledger contabilizado, bancos e inventario—, pero una suite aislada por módulo no demuestra por sí sola que todos terminan representando la misma verdad económica. #559 requiere una comprobación reproducible de `ventas ↔ cuentas por cobrar ↔ ledger ↔ bancos ↔ inventario/COGS ↔ compras ↔ cuentas por pagar`.

## Decisión

La autoridad de negocio sigue siendo PostgreSQL y los servicios/rutas existentes. La reconciliación se implementa como **gate de verificación**, no como un subsistema que reescribe saldos o “arregla” diferencias.

El dataset versionado `qa/fixtures/financial-reconciliation-v559.json` ejecuta, sobre PostgreSQL 17 efímero reconstruido desde migraciones canónicas, un flujo con:

- saldo de apertura de inventario;
- compra emitida y su efecto de cuentas por pagar/ledger;
- entrada de inventario trazada a la compra;
- venta emitida y su efecto de cuentas por cobrar/ledger;
- salida de inventario trazada a la venta y COGS derivado del costo unitario del producto;
- cobro bancario conciliado con el asiento de la venta;
- pago bancario conciliado con el asiento de la compra;
- devolución/anulación mediante reverso del ledger y reverso del movimiento de inventario;
- retries y concurrencia con `Idempotency-Key`;
- cierre de periodo server-side;
- accesos negativos tenant A → tenant B y tenant B → tenant A.

Las cuentas contables verificadas son las definidas por la autoridad contable vigente del backend: AR `1.1.03.001`, IVA por pagar `2.1.02.001`, AP `2.1.01.001`, costo de mercancía `5.1.01` e IVA crédito fiscal `1.1.05.001`. El gate no duplica esas reglas; únicamente comprueba sus efectos persistidos.

## Regla de diferencias

Toda comparación produce un objeto explícito `PASS | FAIL`. Un `FAIL` conserva `expected`, `actual`, `difference` y evidencia de trazabilidad (`sourceId`, `ledgerEntryId` u otra identidad). **Nunca** existe autocorrección silenciosa desde el gate. Una divergencia falla la suite y deja el reporte para diagnóstico.

## Idempotencia y autoridad de efectos

La prueba reutiliza las mutaciones productivas y sus `Idempotency-Key`. Comprueba que un retry/concurrent retry no crea más de un documento/asiento/movimiento y que el saldo final sigue siendo el derivado de los efectos únicos. No se introduce una nueva tabla ni una nueva autoridad de saldo.

## Reversos y periodos

Los efectos contabilizados no se reescriben destructivamente. Las anulaciones crean asientos inversos enlazados mediante `reversalOfId`; inventario crea un movimiento de reverso con vínculo auditable. Un periodo cerrado rechaza nuevas ventas/compras contabilizadas en servidor y no deja asientos parciales.

## Aislamiento de tenant

El dataset crea un segundo tenant con actor y permisos mínimos para demostrar ambas direcciones del aislamiento. Los IDs de movimientos de banco e inventario de otro tenant deben resultar invisibles (`404`) incluso si el solicitante conoce el UUID.

## Evidencia exact-SHA

El resultado se escribe en `artifacts/financial-reconciliation-v559/financial-reconciliation-<SHA>.json` e incluye:

- `candidateSha` exacto;
- versión del golden dataset;
- nombre de la base efímera;
- migraciones aplicadas y checksum;
- checks y diferencias concretas;
- resumen PASS/FAIL.

El workflow `.github/workflows/financial-reconciliation-v559.yml` conserva ese reporte y logs como artifact ligado a `${{ github.sha }}`. Un workflow que no se ejecutó no puede declararse PASS.

## Migraciones y rollback

#559 no requiere cambio de esquema. La prueba reconstruye PostgreSQL desde cero con el historial canónico existente. El rollback de esta implementación consiste en retirar el gate, fixture, prueba y ADR; no hay datos de producción ni migraciones que revertir.

## Consecuencias

- Se obtiene una sola evidencia transversal sin mover la autoridad fuera de los módulos productivos.
- Los fallos señalan la relación económica exacta que diverge.
- El gate reutiliza y refuerza las regresiones financieras históricas en vez de sustituirlas.
- El cierre del issue exige que el candidate exacto pase el contrato estático y el flujo PostgreSQL real; si Actions estuviera indisponible, esa evidencia se reportaría como `NOT_EXECUTED/BLOCKED_INFRASTRUCTURE`, nunca como PASS.
