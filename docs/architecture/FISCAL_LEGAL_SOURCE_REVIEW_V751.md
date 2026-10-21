# #751 · Revisión independiente de fuentes legales (incremento)

Autoridad existente: `FiscalLegalSource` de la migración `20261016143000_issue_751_fiscal_legal_source_drafts`, en el mismo módulo fiscal #629. Esta extensión **no** crea otro repositorio ni activa tasas.

## Contrato

- La captura inicial sigue siendo `DRAFT`, inmutable en referencia/hash, con tenant y autor derivados de sesión.
- Un actor distinto al creador, con `fiscal.close`, puede decidir `REVIEWED` o `REJECTED` una sola vez; no hay transición desde estados terminales.
- La revisión exige justificación de 15–500 caracteres y momento UTC del servidor. El cliente no suministra reviewer/status/time.
- `POST /fiscal/legal-sources/:id/review` usa `WHERE tenantId`, `FOR UPDATE` y transición `status=DRAFT`; escribe `AuditLog` dentro de la misma transacción o revierte todo.
- SQL añade constraint de revisión independiente y concede al runtime sólo actualización de las cuatro columnas de revisión. La política RLS tenant del sidecar v845 sigue siendo obligatoria; nunca usar un rol superusuario en el API.
- `REVIEWED` verifica la captura documental en el workflow, **no** aprueba una tasa. El motor `FiscalRuleVersion` todavía carece de `sourceId/status/supersession`; las reglas fiscales productivas de #751 siguen pendientes. Los documentos históricos no se modifican.

## Verificación y bloqueos

- Unit/domain: `node --experimental-strip-types --test tests/fiscal_legal_source_draft_v751.test.mjs`.
- Backend: `npm ci --no-audit --no-fund`, `npm --workspace backend run typecheck`.
- Material pendiente de aprobación de merge: PostgreSQL 17 from-zero + upgrade sobre fixtures sintéticos, RLS runtime A/B, prueba HTTP de usuario revisor/no revisor y concurrencia real. No ejecutar sobre producción.
- Revisión legal humana, activación de reglas, snapshots, UI de auditoría, intervalos y ciclos permanecen en #751 OPEN; no marcar su DoD completo por esta migración.

Rollback de aplicación: revertir el endpoint/código. No borrar capturas ni columnas de evidencia al retroceder; cualquier rollback SQL destructivo exige plan de conservación y revisión aparte.
