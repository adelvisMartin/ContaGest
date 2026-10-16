# #753 — Propuesta de snapshot de cotización aceptada

El helper `prepareAcceptedQuoteSnapshot` complementa el FSM `quote-order-transition-intent.ts` fusionado en PR #1172. Exige cita `accepted`, revision esperada, actor tenant, códigos de producto/moneda y líneas de origen consistentes; preserva cantidad/importe/impuesto **ya cotizados** en strings decimales exactos y comprueba suma de `lineTotalExact` sin suponer tasas fiscales ni revaluar el Product/precio actual. Resultado inmutable y **converted:false/orderCreated:false**.

La identidad tenant/estado/revision/líneas debe derivarse de una lectura servidor/DB autorizada, no de HTTP client. Este helper no es endpoint de conversión ni mecanismo CAS; no crea Quote/SalesOrder, no reserva stock ni contabiliza. El esquema canónico sigue sin tablas SalesQuote/SalesOrder. Falta DDL versionado, autoridad de numeración #763, aceptación/asientos históricos, idempotencia, llamadas #738, observabilidad, QA PG17 A/B y API. No crear source of truth alterna desde JSON.

Rollback: retirar helper/tests/doc (no cambios DB). #753 **PARTIAL/OPEN/NO_MERGE** hasta integración verificable.
