# #751 · Autoridad de reglas fiscales revisadas (continuación del foundation DRAFT)

## Fuente de verdad y límites

Se extiende la autoridad SQL `FiscalRuleVersion` y `FiscalDocumentRuleSnapshot` de #561. No se introduce otro repositorio fiscal ni se asigna ninguna tasa legal venezolana. `FiscalLegalSource` de #751 sigue siendo una captura inmutable; la segunda persona deja un registro inmutable en `FiscalLegalSourceReview`. El estado evaluable corresponde a la regla, no a la captura.

Transiciones permitidas: `DRAFT -> REVIEWED -> ACTIVE -> SUPERSEDED`. Autor, revisor y activador son identidades autenticadas; el autor no puede revisar su propia versión y el revisor no puede activarla. La revisión legal exige persona distinta del capturador. Tanto la API con `fiscal.close` como triggers PostgreSQL verifican las precondiciones. La base conserva tenant-scoping por claves foráneas compuestas y una barrera de bloqueo por `(tenantId, ruleKey)` para activaciones concurrentes.

Las reglas existentes **no se promocionan en el upgrade**: `status='DRAFT'` y sin `legalSourceId` hasta nuevo proceso de revisión. El único DSL habilitado es `RATIONAL_RATE` sobre `TAXABLE_AMOUNT` con fracción entera validada de 0 a 1; esto no es un catálogo de porcentajes legales. La definición almacenada es dato, nunca código.

La consulta efectiva usa instantes UTC y ventanas `[effectiveFrom, effectiveTo)`; sólo versiones activas o históricamente sustituidas con fuente revisada pueden resolverse. Al sustituir una versión, una transacción convierte la antigua a `SUPERSEDED` y activa la nueva, y la consulta histórica conserva el resultado hasta la fecha de la sustitución. La emisión copia versión, hash, fuente/hash, revisor y activador al snapshot inmutable; un cambio futuro no reescribe documentos emitidos.

## Cambios y comprobación

- Migración forward-only: `20261019103000_issue_751_reviewed_rule_authority`. No altera archivos de migraciones aplicadas.
- API: `POST /fiscal/legal-sources/:id/review`, `POST /fiscal/rules/:id/review`, `POST /fiscal/rules/:id/activate`, y creación de reglas exclusivamente como DRAFT.
- UI: lectura de fuentes, huellas, revisión y vigencia en Tributos. No se presenta la captura de tasas como legislación.
- Tests locales: `node --import tsx --test tests/fiscal_legal_source_draft_v751.test.mjs tests/fiscal_rule_lifecycle_v751.test.mjs tests/fiscal_rule_pg_authority_v751.test.mjs tests/ve_reviewed_rule_policy_v751.test.mjs`.
- Prueba PostgreSQL17 proyectada en `qa/fiscal-authority-v561.test.ts`, que emite dos versiones sintéticas con tres actores separados. Requiere ejecución real en runner con BD descartable.

## Riesgos, QA pendiente y reversión

- **Bloqueante de merge:** ejecutar migración from-zero + upgrade y regresión de tenant A/B con PostgreSQL17, contratos de auditoría y E2E. No equivale a prueba real el contrato estático de SQL.
- Dependencia #688 resuelta en `main` mediante PR #1146, junto a correcciones de TypeScript en PR #1245. Deben repetirse las pruebas sobre el SHA integrado.
- Se exige verificar el resto del CI del SHA candidato. No se anulan ni silencian fallos ajenos (#856 PriceEntry, TypeScript y fuentes de Ventas).
- La reversión de aplicación es por PR; **la migración se mantiene forward-only**. Si se necesita desactivar emisión, se hace por permisos/rutas, sin destruir snapshots o reseñas históricas. Una compensatoria para evolución del esquema requiere migración nueva y revisión de retención legal.
