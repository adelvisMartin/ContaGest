# Vista fiscal VE read-only con ámbito comprobado · #775 #776 #778 #780

## Qué implementa este incremento y qué NO

Amplía la política pura `ve-reviewed-rule-policy.ts` **ya fusionada** en #1122 con `previewReviewedVeTaxEvent()`: una única operación de previsualización que primero resuelve una regla según `tenantId + family + selector + eventDate` y *solo después* delega cálculo exacto en `calculateReviewedVeTaxPreview()`. Si faltan fuentes legales activas revisadas, la vigencia es ambigua o se usa una regla de otra familia/empresa/selector, falla cerrado.

**Familias explícitas:** IVA y retención de IVA (#775), ISLR (#776), IGTF (#778), municipal (#780). La función no codifica alícuotas, formas legales, condición de contribuyente, redondeos nuevos ni convenciones municipales; utiliza solo la regla revisada ya autorizada por la política existente. La respuesta es inmutable, marca `previewOnly: true` y lleva la huella del snapshot de previsualización. **No es persistencia histórica.**

Esta función **no está conectada a rutas ni a la base** deliberadamente. No cambia `FiscalRuleVersion`, `FiscalDocumentRuleSnapshot`, asiento, impuestos por cobrar/pagar, emisión documental ni código fiscal de producción. Tampoco convierte por sí sola una regla existente en vigente jurídicamente; la aprobación, fuente, versión, supersession y RBAC son trabajo pendiente del #751 y el perfil RIF/actividades/jurisdicción server-derived del #774. El plan contable y posting dependen de #785/#637. Por tanto **ninguno de los cuatro tickets queda DONE**.

## Contrato de uso futuro

Los campos del evento deben proceder del **contexto autenticado de servidor**, de un selector persistido y de la fecha exacta del hecho imponible, no de un `tenantId`, estatus tributario, alícuota o permiso enviado por el navegador. Luego se debe resolver contra `LegalSource` revisado en la autoridad fiscal, construir snapshot inmutable del documento, aplicar reglas de exenciones/retenciones y contabilizar transaccional e idempotentemente en período abierto. Hasta disponer de ello, toda emisión/retenida real sigue fuera del alcance de este helper.

## Verificación ejecutada y limitaciones

- 13/13 casos del nuevo archivo `tests/ve_tax_event_scoped_preview_v775_776_778_780.test.mjs` ejecutados en **V8 aislado** sobre el código exacto de la rama recuperado de GitHub, retirando anotaciones TypeScript para ejecutar la lógica. Se simuló SHA-256 sólo para el entorno del test aislado: **no certifica criptografía ni build real de Node**.
- 5 familias positivas + 5 familias negativas; reglas DRAFT/SUPERSEDED, fuente inexistente, duplicidad, tenant ajeno, fechas UTC inválidas, selector distinto, límite de fecha y precisión.
- `node --experimental-strip-types --test tests/ve_tax_event_scoped_preview_v775_776_778_780.test.mjs`, typecheck completo, npm build, PostgreSQL17 tenant A/B, navegador, QA normativo, CI exact-SHA **NOT_EXECUTED/BLOCKED** mientras falte checkout/runner y las dependencias upstream.

No se desactivan checks ni se usan credenciales, DB compartida o fixtures con datos privados. Rollback: revertir este helper, su suite y esta guía, sin migraciones ni datos afectados.

## Seguimiento DoD

- **#775:** falta cálculo real IVA/retención, notas/certificados/posting/reversos/conciliación con reglas legales vigentes.
- **#776:** falta concepto/beneficiario/base/mínimos/acumulación, certificados y asientos ISLR.
- **#778:** falta selectors tributarios moneda/medio/operación, exenciones, auditoría, snapshots y posting IGTF.
- **#780:** falta catálogo jurisdicción/actividad, obligación/retención municipal, reconciliación y API.

La activación fiscal y la modificación del ledger requieren revisión independiente, QA integrado PostgreSQL17 y decisión del owner exact-SHA; un código fusionado no convierte el ERP en legalmente conforme.
