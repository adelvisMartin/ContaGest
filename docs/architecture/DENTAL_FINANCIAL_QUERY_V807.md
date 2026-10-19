# #807 — incremento focal de seguridad

Reportes financieros dentales aceptan patientId acotado y rechazan claves no admitidas mediante Zod .strict, sin modificar saldos/monedas ni consulta tenant.

Evidencia: prueba de contrato estática incluida para garantizar la existencia de la protección; **NO** sustituye tests TypeScript/Zod, PostgreSQL17, API o navegador contra checkout completo. #807 sigue OPEN: falta DoD completo, sin cambio de migración, proveedor, check obligatorio ni datos de producción.
