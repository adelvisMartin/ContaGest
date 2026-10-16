# #770 — Portabilidad — previsualización segura CSV

**Estado:** incremento de lógica de dominio aislado, sin integración de base de datos.

## Entregado

Preflight CSV con allowlist de columnas para clients/suppliers/products, límites de 1 MiB y 2.000 filas, detección de columnas/filas malformadas, formulas peligrosas y clave duplicada, hash SHA-256 del archivo y errores por fila sin eco de PII. `canCommit=false` siempre; importar definitivamente exige validación server-owned de tenant, RBAC y transacción auditada.

**Archivo de fuente:** `backend/src/modules/portability/master-import-preflight.mjs`. **Regresiones:** `tests/master_import_preflight_v770.test.mjs`.

## Evidencia real

En un espejo local de las mismas rutas de repositorio con Node.js 22.16.0 se ejecutó `node --test mirror/tests/*.mjs`: **40/40 PASS** globales. De ellas **10/10** corresponden a este incremento. Tanto el archivo de producción como el test publicado se verificaron byte por byte contra GitHub mediante sus blobs Git. También se comprobó la sintaxis de los módulos con `node --check`.

Para reproducir en un checkout completo:

```sh
node --test tests/master_import_preflight_v770.test.mjs
node --check backend/src/modules/portability/master-import-preflight.mjs
```

**NO_EJECUTADO:** `npm ci`, build y lint completos, PostgreSQL 17 de dos tenants, HTTP/browser, migraciones, transacciones reales y Actions del SHA candidato. Ningún éxito de prueba aislada acredita ejecución de dichas puertas.

## Autoridades y alcance pendiente

SOURCE_REUSE=NONE. El helper trabaja con hechos ya verificados por el servidor. **No dispone de API/DDL propio ni persiste nada**; debe conectarse posteriormente a las autoridades actuales y revalidarse dentro de la misma transacción, con RBAC/tenant/ledger/stock según corresponda. No cerrar #770 ni retirarlo de la cola mientras falte su Definition of Done integral. No desactivar required checks ni tratar QUEUED como PASS. Rollback: revertir este documento, el helper y su prueba.
