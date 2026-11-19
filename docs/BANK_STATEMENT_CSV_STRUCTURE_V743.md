# #743 · Validación estricta de estructura CSV bancaria

**Incremento acotado** del importador de conciliación bancaria. El backend continúa usando su autoridad existente `bank-reconciliation.service.ts` para deduplicación, estado de conciliación, decimal, audit y posting: no se crea otro motor bancario.

El nuevo `statement-csv-structure.ts` separa la **lectura estructural** del CSV de la interpretación de fecha/importe. Rechaza comillas sin cerrar, comillas dentro de celdas sin entrecomillar y texto añadido después de la comilla de cierre. Respeta escape de comillas dobles, comas y saltos de línea dentro de celdas citadas, finales de línea CRLF y campos vacíos. El adaptador existente `statement-parser.ts` transforma el error en HTTP 422 `BANK_STATEMENT_CSV_MALFORMED` y rechaza filas con distinta cantidad de columnas de sus cabeceras, evitando asignación silenciosamente errónea de importes.

**Pruebas ejecutadas:** Node v22.16 `node --experimental-strip-types --test tests/bank_statement_csv_structure_v743.test.mjs` => 9/9 PASS sobre archivos cuyo Git blob SHA coincidió con la rama; TypeScript 5.8 global aislado strict => PASS. El adaptador no pudo verificarse con `npm ci`/PostgreSQL 17/HTTP porque no hay checkout completo con dependencias ni conexión de base real; son NOT_EXECUTED, no PASS. En producción **no se alteran** modelos de banco, efectos fiscales, ledger, reversos ni workflows CI.

**Rollback:** revertir los cuatro archivos, sin migración ni tocar datos. Ciertos CSV anteriormente aceptados pese a estructura inválida producirán ahora HTTP 422 intencionalmente. Integración real de los extractos, estados y reconciliación GL, RBAC, dos tenants y QA quedan pendientes en #743; **issue OPEN** hasta DoD. `SOURCE_REUSE=NONE`.
## Endurecimiento incremental — límites + calendario + provenance v1.3.0

Un extracto CSV de hasta 5 MiB podía provocar expansión desproporcionada de arrays mediante delimitadores, o aceptar fechas imposibles por normalización de JavaScript (`2026-02-30`). El parser ahora limita **128 columnas, 100 000 filas incluyendo cabecera, 1 000 000 campos totales y 16 384 caracteres por campo**, incluida la lectura entrecomillada. Rechaza exceso antes de procesar banco/contabilidad con HTTP **413** `BANK_STATEMENT_CSV_LIMIT_EXCEEDED`. Los CSV estructuralmente inválidos siguen devolviendo 422. La verificación de fechas calendario funciona para ISO y OFX compacto y conserva fechas válidas, saltos de línea, fechas bisiestas y escape RFC4180.

`BANK_STATEMENT_PARSER_VERSION` sube a `1.3.0`: no reinterpreta ni reescribe importaciones históricas. Los retries con `sourceHash` previo devuelven el `parserVersion` **persistido** en lugar de presentar falsamente la versión actual.

Pruebas nuevas: límites de estructura RFC4180, HTTP 413, rollover de fechas, replay de versión persistida y rechazo de UPDATE histórico por trigger inmutable en PostgreSQL efímero. Los tests de estructura fueron ejecutados **localmente sobre implementación aislada equivalente** (5/5 grupos PASS, Node 22), y las pruebas aisladas de calendario 2/2 PASS. El test PostgreSQL, test completo del backend, CI y browser están **NOT_EXECUTED** hasta sus ejecuciones exact-SHA. Nunca usar bases compartidas. No se modifican modelos, migraciones, roles, accounting/ledger ni movimientos históricos.

Riesgo explícito: CSV anteriormente aceptados con celdas excesivas o fechas imposibles ahora fallan en validación; no hay eliminación ni corrección silenciosa. Para revertir, revertir sólo el cambio de parser/servicio y preservar intacta la evidencia bancaria preexistente.
