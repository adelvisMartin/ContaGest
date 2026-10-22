import { Router, type Request } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { buildCompliancePeriodReadiness } from './fiscal-compliance-readiness.js';

const router = Router();
router.use(requirePermission('fiscal.read'));
function workflowFlags(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const record = (payload as Record<string, unknown>)._complianceEvidenceV1;
  if (record === undefined) return undefined;
  if (!record || typeof record !== 'object' || Array.isArray(record))
    throw new HttpError(409, 'La evidencia interna de la declaración está dañada.', { code: 'COMPLIANCE_WORKFLOW_EVIDENCE_INVALID' });
  const workflow = record as Record<string, unknown>;
  // Only record presence; official proof and current bank matching are not
  // inferred from potentially stale historical payloads.
  return { review: !!workflow.review, filing: !!workflow.filing,
    payment: !!workflow.payment, reconciliation: !!workflow.reconciliation };
}
router.get('/readiness', asyncHandler(async (req, res) => {
  const period = req.query.period;
  if (Object.keys(req.query).some(key => key !== 'period') ||
      typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    throw new HttpError(422, 'Período requerido en formato AAAA-MM.', { code: 'COMPLIANCE_PERIOD_INVALID' });
  const tenantId = (req as Request & { context?: { tenantId?: unknown } }).context?.tenantId;
  if (typeof tenantId !== 'string' || !tenantId.trim())
    throw new HttpError(401, 'Se requiere contexto de empresa autenticada.', { code: 'FISCAL_TENANT_REQUIRED' });
  const [taxPeriod, closings, fiscalDocumentCount] = await Promise.all([
    prisma.taxPeriod.findUnique({
      where: { tenantId_period: { tenantId, period } },
      select: { id: true, status: true, ivaDebit: true, ivaCredit: true, igtfPaid: true, declarations: {
        take: 201, select: { id: true, kind: true, status: true, amount: true, payload: true },
      } },
    }),
    prisma.closingPeriod.findMany({
      where: { tenantId, period, module: { in: ['fiscal', 'iva', 'islr', 'igtf', 'retiva', 'municipal'] } },
      select: { module: true, status: true }, take: 21,
    }),
    prisma.fiscalDocument.count({ where: { tenantId, period } }),
  ]);
  if ((taxPeriod?.declarations.length || 0) > 200 || closings.length > 20)
    throw new HttpError(413, 'El período supera el límite del diagnóstico; no se devuelve información truncada.', { code: 'COMPLIANCE_EVIDENCE_LIMIT' });
  const report = buildCompliancePeriodReadiness({
    tenantId, period,
    taxPeriod: taxPeriod ? { id: taxPeriod.id, status: taxPeriod.status,
      recordedBalancesExact: { ivaDebit: taxPeriod.ivaDebit.toString(),
        ivaCredit: taxPeriod.ivaCredit.toString(), igtfPaid: taxPeriod.igtfPaid.toString() } } : null,
    declarations: (taxPeriod?.declarations || []).map(row => ({
      id: row.id, kind: row.kind, status: row.status, amountExact: row.amount.toString(),
      workflowEvidence: workflowFlags(row.payload),
    })),
    closings, fiscalDocumentCount,
  });
  ok(res, report);
}));
export default router;
