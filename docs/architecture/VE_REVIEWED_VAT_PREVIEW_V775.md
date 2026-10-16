# #775 · IVA / retención — cálculo preliminar sin posting

Se añade `previewReviewedVatBreakdown`, que consume el guard fiscal **existente** `assertReviewedVeRule` y su función de cálculo BigInt/half-up. Recibe bases gravadas/exentas/no sujetas en unidades menores, comprueba aritmética entera sin desbordamiento y devuelve IVA, retención opcional calculada **sobre el IVA**, total bruto/neto y snapshots fuente/revisor. Los porcentajes usados en los tests son **sintéticos y no fiscales**.

La función no confía en una tasa del navegador: **no se expone endpoint** mientras #751 no provea una autoridad persistente de fuentes revisadas/efectivas y #774 no determine clasificación autorizada. Tampoco emite certificados, facturas, notas ni ledger; no cambia balances, UI, roles ni RLS. Su uso en producción está bloqueado hasta enlazar rule lookup server-derived, aprobación legal, semantic posting #785, idempotencia, reversos/conciliación, tests PG17 dos-tenant y E2E.

**PARTIAL / NO_MERGE**: pruebas unitarias focales no bastan para criterio de aceptación completo. No interpretar `status: ACTIVE` en una fixture como aprobación legal real.
