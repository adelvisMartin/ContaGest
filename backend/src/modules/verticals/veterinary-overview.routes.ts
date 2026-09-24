import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { ctx } from './verticals.shared.js';

const router = Router();

router.get('/dashboard', asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const [patients, appointments, labOrders, criticalResults, hospitalizations, vaccines] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CarePatient" WHERE "tenantId"=$1 AND "kind"='animal' AND "active"=true`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE "status" IN ('scheduled','confirmed','checked_in'))::int AS pending FROM public."CareAppointment" a JOIN public."CarePatient" p ON p."id"=a."patientId" WHERE a."tenantId"=$1 AND p."kind"='animal' AND a."startsAt">=date_trunc('day',now()) AND a."startsAt"<date_trunc('day',now())+interval '1 day'`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareLabOrder" WHERE "tenantId"=$1 AND "status" NOT IN ('completed','cancelled')`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareLabResult" WHERE "tenantId"=$1 AND "flag" IN ('critical','high','low','abnormal') AND "observedAt">=now()-interval '30 days'`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareHospitalization" WHERE "tenantId"=$1 AND "status" IN ('admitted','observed')`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareImmunization" i JOIN public."CarePatient" p ON p."id"=i."patientId" WHERE i."tenantId"=$1 AND p."kind"='animal' AND i."nextDueAt" IS NOT NULL AND i."nextDueAt"<=now()+interval '30 days'`, tenantId)
  ]);
  ok(res, {
    patients: Number(patients[0]?.total || 0),
    appointmentsToday: appointments[0] || { total: 0, pending: 0 },
    pendingLabOrders: Number(labOrders[0]?.total || 0),
    abnormalResults: Number(criticalResults[0]?.total || 0),
    hospitalized: Number(hospitalizations[0]?.total || 0),
    vaccinesDue: Number(vaccines[0]?.total || 0)
  });
}));

export default router;
