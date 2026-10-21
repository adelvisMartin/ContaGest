# #755 · Preselección FEFO inmutable por lote

`prepareFefoAllocation` calcula únicamente una **propuesta** de asignación por tenant/producto/ubicación con cantidades exactas mediante `BigInt` a seis decimales, sin `Number` monetario ni movimientos de stock. Rechaza referencias fuera del tenant/product/location, lotes duplicados, fechas inválidas y cantidades no canónicas; excluye lotes inactivos/vencidos/sin saldo; ordena por caducidad FEFO, recepción FIFO y ID estable. Devuelve cantidades sugeridas, asignadas y backorder.

El allocator **NO** valida existencia de balance real en base de datos ni bloquea concurrencia. Una confirmación futura DEBE releer balances por location+lot bajo transacción, comprobar reservas de #738, idempotencia y autorización de fecha/override antes de escribir mediante la autoridad existente de inventario. El retorno conserva `persisted:false`, `stockMovementAuthorized:false`.

**Pruebas:** 7/7 Node22 nativo y TypeScript aislado strict PASS sobre contenido cotejado Git SHA. Sin PostgreSQL17/tenant A/B real, migración, API/browser ni CI completada. #755 permanece OPEN/PARTIAL, no declarar core FEFO conectado ni cerrar. Rollback: revert de tres archivos, sin datos de negocio. `SOURCE_REUSE=NONE`.


## Endurecimiento de inmutabilidad de cada lote (#755)

Aunque la propuesta FEFO devolvía un objeto y un array congelados, cada entrada de `lots[]` seguía siendo mutable, por lo que un consumidor JavaScript podía alterar la `quantityExact` o `lotId` sugeridos sin recalcular los totales. Las selecciones ahora se crean con `Object.freeze` individual antes de congelar el array, manteniendo el mismo contrato, orden FEFO, precisión BigInt y flags `persisted:false`/`stockMovementAuthorized:false`. Esta vista no es una reserva real ni autoriza stock: el servicio transaccional de #755/#738 seguirá revalidando lotes, saldos y tenant en PostgreSQL17. Rollback: revertir el freeze y test asociado (se perdería esta protección de integridad en memoria).
