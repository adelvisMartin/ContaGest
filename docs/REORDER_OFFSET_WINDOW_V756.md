# #756 · Límite exacto de offset en el catálogo de reposición

**Problema:** `reorderScanPageMeta` podía ofrecer `hasMore:true` y `nextSkip` mayor que `REORDER_SCAN_MAX_SKIP=1_000_000`, aunque el parser de la próxima llamada rechaza ese valor. Así sugería una continuación irrealizable, con riesgo de confundir una página incompleta con cobertura integral.

**Corrección:** si hay más productos y el offset calculado excede el máximo, el helper rechaza con `REORDER_SCAN_OFFSET_WINDOW_EXCEEDED` sin emitir el cursor. El endpoint GET de análisis de reposición traduce exactamente ese error a HTTP 422 con el mismo código; no captura ni altera otros TypeError. Un lote final sin más páginas continúa siendo válido, incluso si el último offset calculado supera el máximo. Ningún ajuste se hizo a stock, reservas, minStock o compras automáticas.

**Evidencia local:** Node v22.16.0 ejecutó `node --experimental-strip-types --test tests/reorder_scan_offset_window_v756.test.mjs`: 5/5 PASS, sobre archivos de helper y test cuyo blob Git coincide con lo publicado. TypeScript 5.8.3 `tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext` focal: PASS. El nuevo bloque del router se inspeccionó en GitHub pero **NO** se ejecutó el backend HTTP/Prisma/PG17 real. `npm ci`, full backend typecheck y browser siguen NOT_EXECUTED.

No hay migración ni datos a borrar. Rollback: revertir router/helper/prueba/doc. **El issue #756 permanece abierto:** falta política de compra persistente por location, FEFO transaccional #755, conectores de alertas y QA exact-SHA. `SOURCE_REUSE=NONE`.