# #751 — Capturas legales en borrador (incremento no activable)

El catálogo `public."FiscalLegalSource"` es un registro **aditivo**, en el mismo PostgreSQL/Supabase fiscal de ContaGest. No duplica `FiscalRuleVersion` ni cambia el posting existente. Crea capturas *declaradas por el operador* con tipo, referencia, título, enlace HTTPS opcional, fecha de publicación, SHA-256 declarado y metadatos mínimos. `capturedAt`, `createdBy` y `tenantId` vienen del servidor. El contenido de la fuente **no** se descarga ni se verifica criptográficamente contra el URL en este incremento.

Endpoints (bajo el router fiscal actual): `GET /legal-sources` exige `fiscal.read`; `POST /legal-sources` exige `fiscal.close`. El cuerpo POST no acepta `tenantId`, `createdBy`, `reviewedBy`, `status` ni tasas. Toda fila se registra en estado **DRAFT**; tanto el guard de entrada como el constraint SQL impiden que se guarde como `ACTIVE`. No existe API para aprobar, superseder, fijar reglas ni usar este registro en cálculo. El evento de alta deja actor permanente en la fila; el audit log general es best-effort y **no acredita todavía** auditoría transaccional DoD.

## Deployment y pruebas pendientes

1. Aplicar la migración Prisma de 20261016143000 en una **base PostgreSQL 17 aislada** tras verificar el chain de origen, y luego la política runtime canónica `ops/database/runtime-rls-policy-v845.sql`; no usar producción para probar.
2. Verificar `contagest_runtime` limitado a `SELECT,INSERT`, política RLS tenant A/B, negaciones anónimas, permiso `fiscal.close`, integridad de duplicados, upgrade y recuperación. Validar que sin sidecar el rol runtime queda fail-closed.
3. Ejecutar lint, typecheck, build, tests de backend y E2E de API por SHA; verificar que ninguna emisión fiscal existente se modifique.
4. Como siguiente incremento de #751, modelar revisión dual/RBAC, supersession acíclica, vinculación `FiscalLegalSource -> FiscalRuleVersion -> FiscalDocumentRuleSnapshot`, migraciones y QA real. **No** declarar DoD ni autorizar tasas hasta completar esas fases.

Rollback antes del primer uso: revertir migración en base efímera; después de captura, conservar filas y efectuar roll-forward auditado, nunca borrar evidencias legales de producción. SOURCE Messenger y Control Hípico quedan fuera de este cambio.
