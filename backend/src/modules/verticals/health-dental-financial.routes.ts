import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { calculateInvoiceTotals } from '../../shared/financial/invoice.js';
import { serializeDecimal } from '../../shared/financial/decimal.js';
import { ctx, one, num } from './verticals.shared.js';
import {
  acceptedDentalTreatmentPlanClinicalDataSchema,
  dentalFinancialQuerySchema
} from './health.schemas.js';
import {
  buildDentalFinancialAnalytics,
  dentalCentsMoney,
  dentalFinancialLinkSelect,
  dentalMoneyCents,
  normalizeFinancialLink
} from './health.route-helpers.js';

const router = Router();

router.get('/health/dental/financial', requirePermission('health.manage'), requirePermission('sales.view'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const query=dentalFinancialQuerySchema.parse(req.query||{});
  const patientId=query.patientId||null;

  const [linkRows,planCounts]=await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`
      ${dentalFinancialLinkSelect}
      WHERE l."tenantId"=$1
        AND ($2::text IS NULL OR l."patientId"=$2)
      ORDER BY l."createdAt" DESC
      LIMIT 1000
    `,tenantId,patientId),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT
        count(*) FILTER (
          WHERE "clinicalData" #>> '{treatmentPlan,acceptance,status}' = 'accepted'
            AND "status"='signed'
        )::int AS "acceptedPlans",
        count(*) FILTER (
          WHERE "clinicalData" #>> '{treatmentPlan,acceptance,status}' = 'pending'
            AND "status"='draft'
        )::int AS "pendingPlans",
        count(*) FILTER (
          WHERE "clinicalData" #>> '{treatmentPlan,acceptance,status}' = 'rejected'
            AND "status"='cancelled'
        )::int AS "rejectedPlans"
      FROM public."CareEncounter"
      WHERE "tenantId"=$1
        AND "type"='dental-treatment-plan'
        AND ($2::text IS NULL OR "patientId"=$2)
    `,tenantId,patientId)
  ]);

  const links=linkRows.map(normalizeFinancialLink);
  const analytics=buildDentalFinancialAnalytics(linkRows);
  ok(res,{
    scope:patientId?{patientId}:{patientId:null},
    summary:{
      acceptedPlans:num(planCounts[0]?.acceptedPlans),
      pendingPlans:num(planCounts[0]?.pendingPlans),
      rejectedPlans:num(planCounts[0]?.rejectedPlans),
      linkedPlans:links.length,
      unlinkedAcceptedPlans:Math.max(0,num(planCounts[0]?.acceptedPlans)-links.length),
      totalsByCurrency:analytics.totalsByCurrency
    },
    professionals:analytics.professionals,
    procedures:analytics.procedures,
    links
  });
}));

router.post('/health/encounters/:id/financial-link', requirePermission('health.manage'), requirePermission('sales.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const actorId=String(ctx(req).userId||'').trim();
  if(!actorId)throw new HttpError(401,'La integración financiera requiere un actor autenticado.');
  const treatmentPlanId=String(req.params.id||'').trim();
  if(!treatmentPlanId)throw new HttpError(422,'Plan de tratamiento inválido.');

  const result=await prisma.$transaction(async (tx)=>{
    const lockKey=`dental-financial:${tenantId}:${treatmentPlanId}`;
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,lockKey);

    const existing=await tx.$queryRawUnsafe<any[]>(`
      ${dentalFinancialLinkSelect}
      WHERE l."tenantId"=$1 AND l."treatmentPlanId"=$2
      LIMIT 1
    `,tenantId,treatmentPlanId);
    if(existing.length)return {record:normalizeFinancialLink(existing[0]),replayed:true};

    const planRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT e.*,
             p."displayName" AS "patientName",
             pr."fullName" AS "professionalName"
      FROM public."CareEncounter" e
      JOIN public."CarePatient" p
        ON p."tenantId"=e."tenantId" AND p."id"=e."patientId"
      LEFT JOIN public."CareProfessional" pr
        ON pr."tenantId"=e."tenantId" AND pr."id"=e."professionalId"
      WHERE e."tenantId"=$1 AND e."id"=$2
      FOR UPDATE OF e
    `,tenantId,treatmentPlanId);
    const planEncounter=one(planRows,'Plan de tratamiento no encontrado.');
    if(planEncounter.type!=='dental-treatment-plan')throw new HttpError(422,'El encuentro no es un plan de tratamiento odontológico.');
    if(planEncounter.status!=='signed')throw new HttpError(409,'Sólo un plan aceptado y firmado puede originar un borrador ERP.');

    const clinicalData=acceptedDentalTreatmentPlanClinicalDataSchema.parse(planEncounter.clinicalData||{});
    const treatmentPlan=clinicalData.treatmentPlan;
    const commercialLines=treatmentPlan.phases.flatMap((phase)=>phase.procedures.map((procedure)=>({
      phaseOrder:phase.order,
      phaseName:phase.name,
      procedure:procedure.name,
      tooth:String(procedure.tooth||'').trim()||null,
      quantity:procedure.quantity,
      unitPrice:procedure.unitPrice,
      description:`${phase.name} · ${procedure.name}${String(procedure.tooth||'').trim()?` · Pieza ${String(procedure.tooth).trim()}`:''}`
    })));
    if(!commercialLines.length)throw new HttpError(409,'El plan aceptado no contiene procedimientos facturables.');

    const calculated=calculateInvoiceTotals(commercialLines.map((line)=>({
      quantity:String(line.quantity),
      unitAmount:String(line.unitPrice),
      taxRate:'0'
    })));
    const acceptedTotal=dentalCentsMoney(dentalMoneyCents(treatmentPlan.budget.estimatedTotal));
    const calculatedTotal=serializeDecimal(calculated.total,2);
    if(calculatedTotal!==acceptedTotal)throw new HttpError(409,'El presupuesto aceptado no coincide con las líneas recalculadas. Revisa el plan antes de crear el borrador ERP.');

    const now=new Date();
    const invoiceNumber=`DENT-${treatmentPlanId}`;
    const fiscalPeriod=now.toISOString().slice(0,7);
    const invoice=await tx.salesInvoice.create({
      data:{
        tenantId,
        clientId:null,
        number:invoiceNumber,
        issueDate:now,
        fiscalPeriod,
        currency:treatmentPlan.budget.currency,
        exchangeRate:'1',
        subtotal:calculated.subtotal,
        iva:calculated.tax,
        igtf:'0',
        islrRetention:'0',
        total:calculated.total,
        status:'draft',
        notes:'Borrador ERP originado desde un plan odontológico aceptado. Validar cliente, tratamiento fiscal y tasa de cambio antes de emitir.',
        lines:{
          create:commercialLines.map((line,index)=>({
            description:line.description,
            quantity:calculated.lines[index].quantity,
            unitPrice:calculated.lines[index].unitAmount,
            taxRate:calculated.lines[index].taxRate,
            total:calculated.lines[index].total
          }))
        }
      },
      include:{lines:true}
    });

    const budgetSnapshot={
      schema:'dental-financial-budget.v1',
      treatmentPlanId,
      acceptedAt:treatmentPlan.acceptance.decidedAt||planEncounter.signedAt||null,
      patient:{id:String(planEncounter.patientId),displayName:String(planEncounter.patientName||'Paciente')},
      professional:{
        id:planEncounter.professionalId?String(planEncounter.professionalId):null,
        name:planEncounter.professionalName?String(planEncounter.professionalName):'Sin profesional'
      },
      currency:treatmentPlan.budget.currency,
      estimatedTotal:acceptedTotal,
      invoiceNumber,
      fiscalReviewRequired:true,
      fiscalPolicy:'draft-only-no-tax-assumption',
      lines:commercialLines.map((line,index)=>({
        phaseOrder:line.phaseOrder,
        phaseName:line.phaseName,
        procedure:line.procedure,
        tooth:line.tooth,
        quantity:line.quantity,
        unitPrice:String(line.unitPrice),
        lineTotal:serializeDecimal(calculated.lines[index].total,2)
      }))
    };

    const inserted=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."DentalFinancialLink"
        ("id","tenantId","treatmentPlanId","patientId","salesInvoiceId","currency","quotedTotal","budgetSnapshot","createdBy","createdAt")
      VALUES
        (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6::numeric,$7::jsonb,$8,now())
      RETURNING *
    `,tenantId,treatmentPlanId,planEncounter.patientId,invoice.id,treatmentPlan.budget.currency,acceptedTotal,JSON.stringify(budgetSnapshot),actorId);
    const link=one(inserted);

    await tx.auditLog.create({
      data:{
        tenantId,
        userId:actorId,
        action:'dental.financial.link.created',
        entity:'DentalFinancialLink',
        entityId:String(link.id),
        after:{
          treatmentPlanId,
          patientId:String(planEncounter.patientId),
          salesInvoiceId:invoice.id,
          invoiceNumber,
          currency:treatmentPlan.budget.currency,
          quotedTotal:acceptedTotal,
          status:'draft',
          fiscalReviewRequired:true
        }
      }
    });

    return {
      record:normalizeFinancialLink({
        ...link,
        invoiceNumber,
        invoiceStatus:'draft',
        invoiceTotal:calculatedTotal,
        patientName:planEncounter.patientName,
        professionalId:planEncounter.professionalId,
        professionalName:planEncounter.professionalName
      }),
      replayed:false
    };
  });

  res.setHeader('Idempotency-Replayed',result.replayed?'true':'false');
  ok(res,{...result.record,replayed:result.replayed},result.replayed?200:201);
}));


export default router;
