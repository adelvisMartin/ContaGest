import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx } from './verticals.shared.js';

const router=Router();

// Human imaging projection over the canonical shared CareDiagnosticStudy table.
// Original storage paths, unverified external URLs and unrevised clinical text
// must never be treated as signed media or a reviewed diagnostic report.
router.get('/health/patients/:id/imaging', requirePermission('health.manage'), asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId;
  const patientId=String(req.params.id||'');
  const patients=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."CarePatient"
    WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='human' AND "active"=true LIMIT 1
  `,tenantId,patientId);
  if(!patients.length)throw new HttpError(404,'Paciente humano activo no encontrado.');
  const studies=await prisma.$queryRawUnsafe<any[]>(`
    SELECT s."id",s."patientId",s."encounterId",s."professionalId",s."kind",
           s."title",s."bodySite",s."status",s."scheduledAt",s."performedAt",s."createdAt",
           pr."fullName" AS "professionalName"
    FROM public."CareDiagnosticStudy" s
    JOIN public."CarePatient" p ON p."tenantId"=s."tenantId" AND p."id"=s."patientId" AND p."kind"='human'
    LEFT JOIN public."CareProfessional" pr ON pr."tenantId"=s."tenantId" AND pr."id"=s."professionalId"
    WHERE s."tenantId"=$1 AND s."patientId"=$2
    ORDER BY COALESCE(s."performedAt",s."scheduledAt",s."createdAt") DESC,s."id" DESC
    LIMIT 100
  `,tenantId,patientId);
  res.setHeader('Cache-Control', 'no-store');
  ok(res,{studies,readOnly:true,reportsReviewed:false,attachmentsAvailable:false});
}));

export default router;
