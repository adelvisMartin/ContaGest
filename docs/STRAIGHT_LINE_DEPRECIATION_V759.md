# #759 — Propuesta determinista de depreciación lineal

Módulo puro `straight-line-schedule.mjs` calcula `(costo - residual)/meses` con centésimos exactos BigInt. Política **provisional**: primera cuota en el mes calendario posterior a la puesta en servicio; el ajuste de centavos se asigna al último periodo para reconciliar el monto total y conservar el valor residual. La fecha y versión se validan; no se aceptan mezclas de tenant.

**No es autorización de depreciación contable ni regla fiscal vigente**: no crea Asset, journal, fiscal period, reversing entry ni disposal. La aplicación final debe obtener la política aprobada para el tenant/asset, comprobar period locks y postear Debe/Haber mediante #637 con idempotencia en PostgreSQL. `posted:false` y `requiresFinancialDomainPosting:true` son explícitos.

Pruebas: `node --test tests/straight_line_depreciation_v759.test.mjs`. Pendiente: Asset models, acquisition/transfers, policy approved, period/year handling, posting/reversal/disposal, PG17 tenant A/B, API/browser. #759 permanece OPEN. Rollback: revert 3 archivos; sin migración. SOURCE_REUSE=NONE.
