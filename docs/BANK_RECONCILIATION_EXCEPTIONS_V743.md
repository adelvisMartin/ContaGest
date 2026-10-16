# #743 — Excepciones de conciliación por página (avance parcial)

`GET /bank-reconciliation/exceptions?accountId=<UUID>&take=50` reutiliza la autoridad `listStatementLines` y el router autenticado `banking.manage`. Se comprueba propiedad de cuenta del tenant en servidor y se transforma solamente id/estado/fecha/importe/allocated/remaining. El nuevo helper verifica igualdad exacta `abs(amount)-allocated=remaining` con BigInt céntimos, detecta `OVERALLOCATED`, `UNRECONCILED_STATUS` y `STATUS_AMOUNT_MISMATCH`. **No expone** raw statement, reference, memo, counterparties ni payloads sensibles.

La consulta lee como máximo `take+1` líneas y declara `PAGE_ONLY`, nunca prueba cierre completo ni conciliación GL. Al ser la ventana más reciente, resultados omitidos o posteriores deben tratarse como desconocidos. La implementación vigente de import/matching/reversal de #743 es la única autoridad de escritura, sin tocarla.

Pruebas unitarias puras no sustituyen validación PostgreSQL17, endpoint/permiso y reconciliación auditada de dos tenants. No hay migrations ni efectos de dinero, ni llamadas a proveedor. #743 **OPEN/PARTIAL**, no merge hasta gates materiales.
