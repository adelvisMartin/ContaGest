# ADR · #564 Capacity baseline

## Decision

ContaGest separa **medición** de **presupuesto de rendimiento**. Este cambio crea una campaña reproducible que mide API, PostgreSQL, memoria, XLSX, bundle/chunks y render browser sobre el SHA exacto. La primera campaña **no activa thresholds de latencia, heap, bundle o long tasks**: hacerlo antes de obtener ejecuciones comparables convertiría números arbitrarios en requisitos de CI.

La salida principal queda en `artifacts/performance/` e incluye p50/p95/p99 de la ruta seleccionada, muestras Prisma y fingerprints de queries para detectar crecimiento tipo N+1, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, variación RSS, tiempo/heap del XLSX objetivo, tamaños del build y métricas de navegación/recursos/long tasks de Chromium.

## Dataset y aislamiento

La prueba crea un tenant UUID exclusivo por ejecución y genera un dataset sintético dentro de ese tenant. El cleanup elimina ese tenant mediante las relaciones existentes. CI usa PostgreSQL 17 efímero; nunca reutiliza una base compartida de desarrollo o producción. Los headers de desarrollo se habilitan sólo bajo `NODE_ENV=test` dentro del job.

El dataset inicial contiene 2.500 productos y el export objetivo 10.000 filas. Esos tamaños describen la carga de caracterización, no un SLO. Pueden aumentarse mediante variables del job cuando una campaña de capacidad requiera otra escala.

## Large tables

El CRUD transversal ahora aplica una ventana server-side compatible con el contrato de array existente: `take` está limitado a 500, `skip` permite avanzar páginas y el orden es estable por `createdAt DESC, id DESC`. No se cambia la forma JSON de las respuestas. Los headers `X-CG-Page-Take` y `X-CG-Page-Skip` exponen la ventana efectiva para clientes y pruebas.

## N+1 y query hotspots

`PRISMA_QUERY_TELEMETRY=true` habilita la telemetría ya existente sólo en el entorno de caracterización. La campaña publica query count/request, percentiles de duración y fingerprints más frecuentes. No añade índices automáticamente: un índice o refactor de consulta sólo se justifica después de observar el plan/query hotspot de una ejecución real.

## Budgets posteriores

Después de disponer de baselines repetidos y comparables para el mismo entorno y carga, un cambio posterior puede convertir métricas estables en budgets de CI. Ese cambio deberá documentar el baseline del que deriva cada threshold y una tolerancia explícita. Hasta entonces el modo es `observe-only`: fallan invariantes funcionales (aislamiento, paginación, errores de export/build), no una cifra de rendimiento inventada.

## Evidencia requerida

Un resultado sólo cuenta cuando el workflow ejecuta el SHA candidato y produce los JSON + marcador exact-SHA. Un workflow queued, skipped, provider-blocked o un artefacto de otro SHA se reporta como NOT VERIFIED, nunca como PASS.
