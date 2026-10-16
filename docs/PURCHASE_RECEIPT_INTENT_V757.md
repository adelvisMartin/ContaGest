# #757 — Compras — preflight de recepción

**Estado:** incremento de lógica de dominio aislado, sin integración de base de datos.

## Entregado

Valida orden confirmada o parcialmente recibida, tenant/orden y líneas consistentes, bloquea sobre-recepción y líneas duplicadas con cantidades enteras de seis decimales (BigInt). El estado `received` exige confirmación explícita de cobertura de todas las líneas. Nunca registra un movimiento de inventario ni crea factura/AP.

**Archivo de fuente:** `backend/src/modules/procurement/purchase-receipt-intent.mjs`. **Regresiones:** `tests/purchase_receipt_intent_v757.test.mjs`.

## Evidencia real

En un espejo local de las mismas rutas de repositorio con Node.js 22.16.0 se ejecutó `node --test mirror/tests/*.mjs`: **40/40 PASS** globales. De ellas **9/9** corresponden a este incremento. Tanto el archivo de producción como el test publicado se verificaron byte por byte contra GitHub mediante sus blobs Git. También se comprobó la sintaxis de los módulos con `node --check`.

Para reproducir en un checkout completo:

```sh
node --test tests/purchase_receipt_intent_v757.test.mjs
node --check backend/src/modules/procurement/purchase-receipt-intent.mjs
```

**NO_EJECUTADO:** `npm ci`, build y lint completos, PostgreSQL 17 de dos tenants, HTTP/browser, migraciones, transacciones reales y Actions del SHA candidato. Ningún éxito de prueba aislada acredita ejecución de dichas puertas.

## Autoridades y alcance pendiente

SOURCE_REUSE=NONE. El helper trabaja con hechos ya verificados por el servidor. **No dispone de API/DDL propio ni persiste nada**; debe conectarse posteriormente a las autoridades actuales y revalidarse dentro de la misma transacción, con RBAC/tenant/ledger/stock según corresponda. No cerrar #757 ni retirarlo de la cola mientras falte su Definition of Done integral. No desactivar required checks ni tratar QUEUED como PASS. Rollback: revertir este documento, el helper y su prueba.
