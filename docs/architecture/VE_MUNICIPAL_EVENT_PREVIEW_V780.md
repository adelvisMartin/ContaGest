# #780 — Motor municipal: ámbito por municipio y actividad

El módulo puro `ve-municipal-event-preview.ts` añade un selector verificable de **municipio + actividad + tipo de operación + categoría de contraparte**. Una regla externa de familia `MUNICIPAL` debe estar `ACTIVE`, revisada con fuente/hash y vigente para el tenant y fecha exactos. El cálculo numérico se delega al guard común `ve-reviewed-rule-policy.ts` sin porcentajes definidos localmente.

No existe tarifa única nacional ni jurisdicción predeterminada. Los identificadores del test son ficticios. No se activa ningún endpoint contable, retenciones, obligaciones, minimum/cap ni clasificación legal. El contexto deberá proceder del perfil autenticado #774 y de una selección de reglas con provenance #751, y deberá comprobarse el vínculo con cuentas #785. Jamás derivar condiciones legales desde contenido del navegador.

Aún faltan catálogos jurídicos, vigencias, límites/umbrales según norma, recibos, calendario, import/export sin ejecución arbitraria, posting, registros fiscales y QA PostgreSQL17 tenant A/B. Por ello **#780 OPEN / PARTIAL / NO_MERGE** y no debe presentarse este preview como cálculo fiscal liberado.
