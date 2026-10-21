# #708 — ERP benchmark parity, matriz de rutas canónicas al 16/10/2026

Manifest `config/erp-parity-gap-ownership-v708.json` con 10 cortes del núcleo ERP. Cada fila identifica ticket propietario, ruta del repositorio efectivamente observada, clasificación `PARTIAL|NOT_VERIFIED` y la aceptación material faltante. Es una matriz de **existencia de código/owner**, no demostración de cumplimiento funcional.

El guard `node scripts/audit-erp-parity-gap-v708.mjs` verifica exactamente estos 10 dominios y que todas las rutas marcadas PARTIAL existen de verdad; bloquea duplicados, tickets inventados, path traversal, fuente inexistente y el intento de convertir `releaseEvidence` en PASS. El control de licencias/procedencia de los benchmarks **sigue siendo** `config/competitive-benchmark-v764.json`, sin duplicar proveedores ni copiar código. `SOURCE_REUSE=NONE`.

**Estado de QA:** source-only; no PostgreSQL, tenant A/B, E2E ni validación del comportamiento contra ERPNext/Dolibarr/Akaunting/Tryton. La investigación original de #708 tiene tickets hijo activos #753/#757/#755/#743/#744/#759/#770/#771/#765/#745. No confundir rutas como `sales.routes.ts` con Quote→Order integrado o un preview bancario con conciliación GL. Ninguna fila debe marcarse EXISTS hasta tests completos y evidencia SHA de release. Esto no altera runtime, datos, fuente contable, workflow CI ni contratos empresariales.
