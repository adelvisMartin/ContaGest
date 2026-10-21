# #756 — Frontera de parámetros de paginación de reorder

Corrección localizada en el parser canónico `parseReorderScanQuery`: anteriormente leía `raw.take/raw.skip/raw.onlyNeedsReorder` por acceso normal de propiedades, que también lee valores heredados desde el prototipo del objeto. Un parser anidado o un objeto decorado podría inyectar filtros u offsets no enviados como datos propios de la consulta.

Ahora se exige que los tres campos declarados sean **propiedades propias de tipo dato** (no getters, no claves heredadas) y se validan sus valores con el mismo parser estricto previo. Se aceptan objetos JSON y objetos de prototipo nulo. No cambia stock, ledger, FEFO, política fiscal ni compra automática. No hay DDL.

Pendientes #756: política de reposición versionada por ubicación, lead time y reserva desde fuentes verificadas, planificación durable aprobada y QA PostgreSQL17/API E2E del reporte completo. Sin gates completos, el ticket permanece OPEN y este PR no se debe fusionar.
