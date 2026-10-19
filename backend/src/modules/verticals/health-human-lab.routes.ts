import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx } from './verticals.shared.js';

const router=Router();

// Only a read model for human medicine. The shared CareLabOrder/CareLabResult
// records remain the authority. Neither a result review workflow nor an
// inventory dispense operation may be simulated by changing their raw status.
router.get('/health/patients/:id/laboratory', requirePermission('health.manage'), asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId;
  const patientId=String(req.params.id||'');
  const patients=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."CarePatient"
    WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='human' AND "active"=true LIMIT 1
  `,tenantId,patientId);
  if(!patients.length)throw new HttpError(404,'Paciente humano activo no encontrado.');
  const [orders,results]=await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`
      SELECT o."id",o."patientId",o."encounterId",o."orderNumber",o."orderedAt",
             o."status",o."priority",o."laboratory",o."specimenType",o."fasting"
      FROM public."CareLabOrder" o
      JOIN public."CarePatient" p ON p."tenantId"=o."tenantId" AND p."id"=o."patientId" AND p."kind"='human'
      WHERE o."tenantId"=$1 AND o."patientId"=$2
      ORDER BY o."orderedAt" DESC,o."id" DESC LIMIT 100
    `,tenantId,patientId),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT r."id",r."labOrderId",r."testCode",r."testName",r."valueText",
             r."valueNumeric",r."unit",r."referenceMin",r."referenceMax",r."referenceText",
             r."flag",r."observedAt",r."verifiedBy",r."createdAt"
      FROM public."CareLabResult" r
      JOIN public."CareLabOrder" o ON o."tenantId"=r."tenantId" AND o."id"=r."labOrderId"
      JOIN public."CarePatient" p ON p."tenantId"=o."tenantId" AND p."id"=o."patientId" AND p."kind"='human'
      WHERE r."tenantId"=$1 AND o."patientId"=$2
      ORDER BY r."observedAt" DESC,r."id" DESC LIMIT 100
    `,tenantId,patientId)
  ]);
  res.setHeader('Cache-Control', 'no-store');
  ok(res,{orders,results,readOnly:true,canDispense:false});
}));

export default router;
