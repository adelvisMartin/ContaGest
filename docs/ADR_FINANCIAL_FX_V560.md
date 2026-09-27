# ADR · #560 Multi-moneda y diferencias cambiarias

## Estado

Accepted para la implementación de #560.

## Problema

Ventas y compras conservaban campos aislados de moneda/tasa, pero no existía una autoridad transversal que fijara precisión, fuente/fecha de tasa, moneda funcional por tenant, conversión server-side, liquidaciones parciales, diferencias realizadas/no realizadas y reversos auditables. Eso permitía que el documento conservara un importe original mientras el ledger trataba el mismo número como si ya estuviera en moneda funcional.

## Decisión

1. **PostgreSQL es la autoridad.** `FinancialFxPolicy` define por tenant la moneda funcional y la política v1 (`ROUND_HALF_UP`, dinero a 2 decimales, tasa a 4 decimales).
2. **El documento conserva la verdad original.** `FinancialFxDocumentSnapshot` congela moneda original, tasa, fecha, fuente, subtotal/impuesto/total originales y sus equivalentes funcionales en el momento de contabilización.
3. **El ledger se contabiliza en moneda funcional.** Las líneas se convierten con `Prisma.Decimal`; no se usa `Number`/`parseFloat` para cálculos financieros. El centavo de redondeo permitido se asigna de forma determinista y el asiento funcional debe terminar exactamente balanceado.
4. **La tasa queda versionada por evento.** BCV/proveedores externos son informativos; nunca reescriben historia. Cada snapshot/evento conserva `rateDate` y `rateSource`.
5. **Diferencia realizada.** Una liquidación vincula documento, movimiento bancario y asiento. Para ventas: cobro funcional actual menos valor histórico reconocido. Para compras: valor histórico de la obligación menos pago funcional actual. La ganancia/pérdida se registra en líneas explícitas del asiento.
6. **Diferencia no realizada.** Una revaluación opera sólo sobre saldo original pendiente, genera asiento explícito y sólo puede existir una revaluación activa por documento. No muta el asiento histórico.
7. **Reverso en vez de borrado.** Una revaluación no realizada se revierte con un nuevo asiento `reversalOfId`; el evento conserva `reversalLedgerEntryId`/`reversedAt`. No se destruye historia.
8. **Idempotencia obligatoria.** `settlements`, `revaluations` y `reverse` pasan por `runFinancialIdempotentMutation`; el mismo `Idempotency-Key` debe reconstruir el mismo recurso y no duplicar ledger/FX/banco.
9. **Cierre de periodo server-side.** Toda operación que postea/reversa llama `assertPeriodOpen` dentro de la transacción.
10. **Tenant isolation.** Todas las lecturas/escrituras autoritativas incluyen `tenantId`; el movimiento bancario, documento, mapeo de cuenta y asiento deben pertenecer al mismo tenant.

## Moneda funcional vs moneda original

- `originalCurrency`: moneda contractual del documento.
- `functionalCurrency`: moneda contable del tenant.
- `exchangeRate`: unidades de moneda funcional por una unidad de moneda original/settlement según el contexto.
- `original*`: valores contractuales inmutables.
- `functional*`: equivalentes usados para ledger y reconciliación.

`provisional != official`: una tasa obtenida de un proveedor no es autoridad histórica hasta que el documento/evento la persiste con fecha y fuente.

## Liquidaciones parciales

`appliedOriginalAmount` consume saldo del documento en su moneda original. `settlementAmount` representa el importe del movimiento bancario en la moneda de la cuenta. El sistema calcula el valor funcional de ambos lados y registra la diferencia realizada. La suma realizada nunca puede superar `originalTotal`.

## Revaluación y reversión

La revaluación calcula el carrying amount funcional del saldo pendiente usando una nueva tasa. El delta se reconoce como ganancia/pérdida no realizada. Para revaluar de nuevo, primero debe revertirse la revaluación activa; así el ledger no acumula capas ambiguas.

## Reporte

`GET /currency/fx/exposure` devuelve por documento:

- original: moneda, subtotal, impuesto, total, tasa, fecha y fuente;
- functional: moneda, subtotal, impuesto y total;
- realizado original acumulado;
- saldo original pendiente;
- carrying amount funcional;
- revaluación activa;
- eventos auditables.

Las diferencias nunca se autocorrigen silenciosamente.

## Seguridad y contratos

- `accounting.view` para lectura; `accounting.post` para mutaciones.
- No SQL dinámico inseguro; queries con `Prisma.sql`.
- No service-role ni secrets al cliente.
- Los mapeos banco→cuenta contable validan tenant y `allowPosting`.
- El endpoint BCV no tiene capacidad de reescribir snapshots/eventos.

## Verificación

El gate #560 usa PostgreSQL 17 efímero, migraciones canónicas, candidate SHA exacto y conserva artifacts. La regresión cubre moneda original/funcional, pago parcial, idempotencia, revaluación, reverso, periodo cerrado y aislamiento tenant A→tenant B. GitHub Actions se reporta por su resultado real; no se infiere PASS si el job no ejecutó steps.
