# #751 · Integridad del snapshot fiscal histórico (PR #1279)

## Alcance y autoridades existentes

**El código del PR no completa #751, #774, #785, #775 ni #776.** Es un hardening de las reglas históricas existentes en `FiscalRuleVersion` y `FiscalDocumentRuleSnapshot` (autoridad #561/#629); no crea un repositorio paralelo. No habilita activación jurídica, fija tasas, genera certificados, contabiliza retenciones ni declara cumplimiento SENIAT.

### Problemas reproducibles por revisión de código

1. La lectura de `/fiscal/documents/:id/rules` devolvía `ruleHash` sin cotejarlo con la definición almacenada. Una manipulación o corrupción silenciosa podía mostrarse como evidencia íntegra.
2. `resolveFiscalRules` usaba `SELECT DISTINCT ON ("ruleKey")`: un conjunto corrupto o con intervalos superpuestos podía ocultar alternativas. La selección parecía inequívoca cuando no lo era.
3. Al emitir, las reglas seleccionadas se copiaban al histórico sin comparar su hash persistido con los campos de la regla.
4. En la versión inicial del PR, la validación de lectura reconstruía el tenant a partir de la petición, en vez de comprobar el campo real devuelto por PostgreSQL.

## Cambios

- El hash SHA-256 conserva **exactamente** la canonicalización #561, imprescindible para documentos ya emitidos. El algoritmo se extrae a `fiscal-rule-snapshot-integrity.ts`, sin duplicar la autoridad.
- Validación tipada de hash, versión, campo tenant, intervalo UTC `[from,to)`, definición y fuente. La comparación del digest usa `timingSafeEqual`; el secreto no es el hash (es evidencia de integridad, no firma/autenticación).
- `resolveFiscalRules` exige una coincidencia temporal única por clave, rechaza las ambigüedades con `409 FISCAL_RULE_AMBIGUOUS` y exige coincidencia de hash antes de permitir emisión.
- La copia histórica y su lectura también verifican el hash. La lectura selecciona el **`tenantId` real** de la fila; las consultas siguen usando filtros de tenant autenticado.
- Migración independiente y aditiva instala trigger que prohíbe `UPDATE`/`DELETE` sobre `FiscalDocumentRuleSnapshot`. No se modifica ninguna migración aplicada, contenido ni tasas históricos. El trigger no sustituye restricciones de privilegios/RLS ni la protección de backups.

## QA y riesgos

**Unit focal**: `node --experimental-strip-types --test tests/fiscal_rule_snapshot_integrity_v751.test.mjs`; cubre canonicalización, límite inicial inclusivo/final exclusivo UTC, manipulaciones, aislamiento A/B y replay histórico.

**Contrato**: `node --test tests/fiscal_rule_snapshot_integrity_contract_v751.test.mjs`.

**PostgreSQL 17 REAL requerido**: `npm run migration:test:from-zero` y `npm run migration:test:upgrade` en bases aisladas; `npm run test:backend:fiscal:authority:real`; `npm --workspace backend exec -- tsx --test ../qa/fiscal-legal-source-review-v751.test.ts`. La suite #561 incluye los nuevos rechazos UPDATE/DELETE. Ejecutar además `npm run typecheck`, `npm run build:backend` y los checks de PR del SHA exacto. Nunca QA sobre producción.

**Compatibilidad**: un documento legacy cuyo hash no coincida ahora recibirá error 409 en lugar de mostrar evidencia corrupta. Las reglas con duplicidades vigentes se bloquean; es un cambio fail-closed intencional. La tabla de reglas de #561 todavía **no** enlaza `LegalSource` revisada ni valida activación jurídica; no se deben usar como catálogo legal aprobado. Las ventanas, supersession, snapshots del perfil y posting de IVA/ISLR siguen pendientes.

**Roll-forward**: si una migración se aplicó, no borrar snapshots ni alterar una migración aplicada. Una retirada justificada del trigger debe ser una migración nueva, con decisión de seguridad y preservación histórica; proteger mediante backup/restore probado. Revisar primero snapshots legacy que pudieran tener divergencias de hash y diagnosticar sin reescribirlos.

## Evidencia exact-SHA

El PR solamente puede marcar `PASS` para comandos realmente ejecutados sobre su candidate SHA. Los checks queued/in_progress no son PASS. La ausencia de PostgreSQL 17, checkout integral o browser bloquea el DoD y el merge aunque el diff de código sea revisado.
