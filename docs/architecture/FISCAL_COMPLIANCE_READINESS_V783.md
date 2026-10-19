# #783 - Cumplimiento fiscal por periodo, diagnostico no certificable

GET /api/v1/fiscal/compliance/readiness?period=AAAA-MM: autenticacion y tenant del servidor -> fiscal.read -> Prisma TaxPeriod y TaxDeclaration (hasta 200), ClosingPeriod (hasta 20) y contador FiscalDocument del mismo tenant y periodo -> helper SHA-256 determinista -> respuesta JSON.

El reporte NO transforma los estados internos filed, paid o closed en evidencia de declaracion oficial, pago bancario o cumplimiento. El esquema actual carece de FK de declaracion a comprobante oficial, fuente fiscal legal revisada y referencia bancaria conciliada. Devuelve BLOCKED_NOT_READY, safeToFileOrPay=false y motivos explicitos. No inventa vencimientos, obligaciones, tasas, multas, saldo ni integracion oficial. No ejecuta escrituras o migraciones.

El hash es evidencia reproducible solo de campos consultados, no prueba de exactitud juridica. No incluye TaxDeclaration.payload que puede contener datos sensibles.

Pendientes: catalogo obligaciones/fuentes legales #751/#774, workflow auditado DRAFT/REVIEWED/READY, adjuntos y calendario, filing externo, idempotencia y conciliacion banking/ledger, PG17 tenant A/B E2E. Ruta mount fiscal.routes.ts compartida con PR #1135 y #1149: sincronizar serialmente antes de merge. NO_MERGE, ticket OPEN/PARTIAL mientras falten gates materiales.
