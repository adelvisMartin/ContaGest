# #759 — Activos — calendario lineal exacto

**Estado:** incremento de lógica de dominio aislado, sin integración de base de datos.

## Entregado

Proyección mensual lineal sin prorrateo con costo y residual exactos a centavos; reparte centavos sobrantes determinísticamente, concilia depreciación acumulada/carrying value y controla fin de mes y años bisiestos. No propone tasa fiscal legal y nunca escribe GL; la convención contable requiere aprobación.

**Archivo de fuente:** `backend/src/modules/assets/asset-straight-line-schedule.mjs`. **Regresiones:** `tests/asset_straight_line_schedule_v759.test.mjs`.

## Evidencia real

En un espejo local de las mismas rutas de repositorio con Node.js 22.16.0 se ejecutó `node --test mirror/tests/*.mjs`: **40/40 PASS** globales. De ellas **10/10** corresponden a este incremento. Tanto el archivo de producción como el test publicado se verificaron byte por byte contra GitHub mediante sus blobs Git. También se comprobó la sintaxis de los módulos con `node --check`.

Para reproducir en un checkout completo:

```sh
node --test tests/asset_straight_line_schedule_v759.test.mjs
node --check backend/src/modules/assets/asset-straight-line-schedule.mjs
```

**NO_EJECUTADO:** `npm ci`, build y lint completos, PostgreSQL 17 de dos tenants, HTTP/browser, migraciones, transacciones reales y Actions del SHA candidato. Ningún éxito de prueba aislada acredita ejecución de dichas puertas.

## Autoridades y alcance pendiente

SOURCE_REUSE=NONE. El helper trabaja con hechos ya verificados por el servidor. **No dispone de API/DDL propio ni persiste nada**; debe conectarse posteriormente a las autoridades actuales y revalidarse dentro de la misma transacción, con RBAC/tenant/ledger/stock según corresponda. No cerrar #759 ni retirarlo de la cola mientras falte su Definition of Done integral. No desactivar required checks ni tratar QUEUED como PASS. Rollback: revertir este documento, el helper y su prueba.
