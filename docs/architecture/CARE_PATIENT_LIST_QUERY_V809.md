# #809 — incremento focal de seguridad

Listado de pacientes deja de interpretar kind inválido como búsqueda global; query con claves desconocidas o search largo/malformado responde HTTP 422, preservando tenant server-scoped.

Evidencia: prueba de contrato estática incluida para garantizar la existencia de la protección; **NO** sustituye tests TypeScript/Zod, PostgreSQL17, API o navegador contra checkout completo. #809 sigue OPEN: falta DoD completo, sin cambio de migración, proveedor, check obligatorio ni datos de producción.
