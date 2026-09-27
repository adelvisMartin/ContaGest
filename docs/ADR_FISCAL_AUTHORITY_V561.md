# ADR · #561 Autoridad fiscal versionada

## Estado

Accepted para la implementación de #561.

## Decisión

PostgreSQL es la autoridad de reglas, secuencias y evidencia de cierre fiscal. La UI y los adapters sólo solicitan operaciones; no calculan números fiscales ni sustituyen la regla vigente.

### Reglas y provenance

Cada regla se identifica por `tenantId + ruleKey + version` y conserva:

- vigencia `effectiveFrom/effectiveTo`;
- `source` y `documentation` obligatorios;
- definición JSON exacta;
- hash determinista;
- actor y fecha de creación.

No se acepta una nueva versión cuya vigencia se solape con otra del mismo tenant/ruleKey. Una tasa o porcentaje regulatorio deja de ser una constante opaca: debe provenir de una versión explícita. Las reglas nuevas no reinterpretan históricos.

### Histórico

Al emitir un documento por la ruta autoritativa, el servidor resuelve las reglas vigentes para `effectiveAt` y copia la versión completa a `FiscalDocumentRuleSnapshot`. Por eso un cambio futuro de IVA, retención u otra regla no altera qué fuente/versión se aplicó al documento anterior.

### Numeración y concurrencia

`FiscalSequence` tiene una sola fila por `tenantId + kind`. La asignación usa un único `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` dentro de la misma transacción que crea el documento. PostgreSQL serializa la actualización de esa fila: dos requests concurrentes no reciben el mismo número. La restricción existente de `FiscalDocument(tenantId, kind, number)` permanece como defensa adicional.

La ruta `/documents/issue` es la autoridad para numeración interna. `/documents` se conserva para documentos externos/manuales y los marca explícitamente como `external/manual`; esto evita romper importaciones o comprobantes de terceros sin confundirlos con una secuencia interna.

### Idempotencia

Emisión y cierre usan `runFinancialIdempotentMutation`. Un mismo `Idempotency-Key` + request reconstruye el mismo recurso y no vuelve a consumir secuencia ni genera otro cierre. Reutilizar la key con otro payload es conflicto.

### Cierre

Antes de cerrar un periodo se verifican en servidor:

- asientos sin contabilizar;
- ventas draft;
- compras draft;
- asientos publicados desbalanceados;
- estado abierto del periodo.

Si existe un blocker, el cierre falla. Si pasa, el estado cambia dentro de la misma transacción y se persisten `prechecks`, `postCloseReport` y `postCloseHash` en `FiscalCloseEvidence`. La evidencia se puede consultar después y no depende del frontend.

### Reapertura

`/fiscal/reopen-period` mantiene la capacidad `fiscal.reopen`; además, el `approvalExecutionGate` global ya clasifica esa ruta como operación sujeta al workflow de aprobación. #561 no introduce un bypass alternativo.

### Seguridad / tenant isolation

Toda query autoritativa incluye `tenantId`. Las reglas, secuencias, snapshots y evidencia tienen FK al tenant y claves/índices tenant-scoped. No se usa SQL dinámico inseguro ni `$queryRawUnsafe/$executeRawUnsafe`.

### Verificación

El gate #561 usa PostgreSQL 17 efímero y candidate SHA exacto. La regresión cubre vigencia/provenance, emisión concurrente, retries idempotentes, snapshot histórico, bloqueo de cierre, evidencia/hash post-close y tenant A → tenant B. Un workflow sin runner/steps se reporta como no ejecutado; nunca como PASS.
