# #743 · Identidad de movimientos de extracto sin ID bancario

**Estado:** corrección implementada sobre authority de importación existente; **no** es certificación contable ni cierre completo #743. Baseline de investigación `main@0b9a78a15e1eb8d9afeeee2f39d86b87a6ab0ca1`. SOURCE_REUSE=NONE.

## Causa raíz y evidencia

La tabla SQL existente `BankStatementLine` mantiene `UNIQUE ("tenantId", "accountId", "lineHash")`; la migración de hardening añadió `UNIQUE ("tenantId", "accountId", "bankLineId") WHERE "bankLineId" IS NOT NULL`. El servicio `importBankStatement` calculaba `statementLineHash(line)` desde los datos normalizados: dos transacciones realmente distintas pero idénticas, sin `bankLineId`, colisionaban en ese unique y `ON CONFLICT DO NOTHING` descartaba la segunda. No es deduplicación segura; es posible pérdida silenciosa de movimiento.

## Cambio de autoridad integrado

- El importador conserva `statementSourceHash(input.bytes)` y la constraint de importación `("tenantId", "accountId", "sourceHash")`. El reintento del mismo archivo retorna el import anterior sin insertar filas.
- `statementImportLineHash` genera la identidad de almacenamiento. Si existe `bankLineId`, conserva la huella canónica anterior y la unique del ID bancario detecta duplicados, sin cambiar consumidores.
- Si falta `bankLineId`, deriva un SHA-256 separado con versión + `sourceHash` + ordinal cero-basado dentro del archivo + huella normalizada. Dos filas idénticas en el mismo archivo ahora reciben claves distintas; el mismo archivo y posición generan la misma clave.
- Se rechazan huellas inválidas, ordinales fuera de rango y pseudo-identificadores coercibles; no se usa `Number` para importes.
- La inserción permanece en la transacción/servicio existente; no crea un segundo ledger, no toca `BankMovement`/GL y conserva audit de source/hash.
- Sin identificador bancario fiable, dos *archivos distintos* con contenido solapado no pueden deduplicarse automáticamente sin riesgo: se preserva evidencia en lugar de descartar movimientos. La revisión humana debe detectar posibles solapamientos antes de conciliar.

## Limitaciones, migración y rollback

Esta corrección NO reconstituye líneas históricas previamente descartadas. Exige reconciliar conteos de extractos históricos con origen bancario antes de dar por completos saldos anteriores. Bajo la migración actual, los hashes persistidos sin `bankLineId` anteriores a este cambio tenían otra semántica; no reescribir ni normalizar destructivamente esos datos.

QA aislado Node 22: las cinco nuevas pruebas de identidad **PASS**; tras añadirlas a las siete suites previas, **62/62 PASS** sobre copia local de fuentes/test con hashes Git exactos; `tsc` focal estricto PASS. PostgreSQL17 imports reales, A/B, idempotencia concurrente, event history, API/browser/GL y CI exact-HEAD: **NOT EXECUTED / NOT VERIFIED**. Estos gates obligatorios bloquean cierre del ticket.

Rollback: revertir el importador y helper/test; si se han importado filas bajo la identidad nueva, preservar sus registros y planificar reconciliación manual antes de revertir código; **no** borrar datos financieros ni volver a descartar líneas. Revisar conflictos de `backend/package.json` con PR #1282 antes de merge.

SOURCE_REUSE=NONE.

## Reutilización de bankLineId con payload divergente

La segunda revisión detectó otro efecto de `ON CONFLICT DO NOTHING`: un `bankLineId` conocido puede llegar en otro extracto con importe/fecha/referencia diferentes; la constraint de bank ID impedía guardar la línea modificada, pero el importador lo contaba como deduplicado. Ahora, ante una inserción sin filas afectadas, el servicio consulta el registro del tenant/cuenta por hash o bank ID y aplica `assertBankLineReplayIdentity`: solo hash **y** bank ID idénticos permiten una repetición; de lo contrario, error HTTP **409** `BANK_STATEMENT_IDENTITY_CONFLICT` y rollback completo de la importación en curso. Las dos regresiones nuevas de replay/colisión están integradas en la suite oficial del módulo. Esto NO permite mutar un movimiento previamente conciliado ni lo corrige automáticamente.

**QA focal tras segundo cambio:** **64/64 PASS** (Node 22, suite conjunta ocho archivos) y `tsc --noEmit --strict` focal PASS; hashes SHA exactos del módulo de identidad `d60ed233f26919ca13c1a6916c19f5cb42b7be3a` y test `ddc4aff2f04578878e8b3acd5e264cc4629cf3f3`. El servicio de importación completo y las transacciones PostgreSQL17 permanecen **NOT VERIFIED** en este entorno. Para certificación se requieren pruebas SQL reales de unique por tenant/cuenta, importación simultánea y reverso/conciliación.
