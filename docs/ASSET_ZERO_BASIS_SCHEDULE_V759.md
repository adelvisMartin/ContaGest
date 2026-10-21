# #759 · Depreciación nula, conservar los períodos del activo

El helper canónico existente `assets/straight-line-schedule.mjs` devolvía `periods=[]` cuando `cost===residual`. Eso confundía una vida útil registrada, pero sin gasto de depreciación, con la ausencia de calendario.

Este cambio puntual genera todos los meses desde el mes posterior a `inServiceDate`, incluso con cargos `0.00` y `carryingValueExact=residual`. No modifica la convención de calendario ni la distribución del resto al último período cuando sí hay base depreciable; no crea asientos y mantiene `readOnly=true/posted=false`.

**Brecha arquitectónica:** siguen existiendo en main **tres políticas** (assets/asset-depreciation-preview.ts, assets/straight-line-schedule.mjs, finance/asset-straight-line-schedule.mjs), con distintas convenciones de primer mes, redondeo, autorización de fuente y límites de vida útil. **No habilitar el posting ni crear Asset definitivo** hasta aprobar UNA convención contable versionada, migrar consumidores y rechazar discrepancias, en vez de sumar una cuarta. Falta modelo Asset, period lock, tenant RBAC, reversos, QA PostgreSQL17 y prueba fiscal.

Scope #759 parcial; SOURCE_REUSE=NONE; revert de un helper + test + doc, sin DB/ledger.