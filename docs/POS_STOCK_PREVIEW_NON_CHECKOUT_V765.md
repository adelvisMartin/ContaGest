# #765 — Estado POS visible no es una autorización de cobro

La política canónica `previewPosStock` ya separa la disponibilidad global aproximada de la confirmación transaccional. Sin embargo su respuesta `ready=true` podía ser interpretada por otros consumidores como «listo para facturar».

Se agregan campos de contrato **siempre falsos**: `authoritativeForCheckout:false` y `stockReserved:false` (además de `readOnly:true`). Los tests prueban disponibilidad, escasez e intento del cliente de colocar flags falsos. No se altera el cálculo Decimal18,3 ni el status `available/shortage` ni se modifica UI, carrito, stock, payments, banking o posting.

DoD #765 sigue requiriendo Checkout atomizado owner-scoped con #738, cajeros/caja/turnos, pagos mixtos, refund, fiscal #751, PostgreSQL17 dos tenants y navegador táctil. Este incremento no concede checkout. PR DRAFT, ticket OPEN. Sin bypass de CI.
