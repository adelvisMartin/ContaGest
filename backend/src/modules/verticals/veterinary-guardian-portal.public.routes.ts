import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';

const router = Router();
const tokenSchema = z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

router.get('/:token', asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  const token = tokenSchema.parse(String(req.params.token || ''));
  const tokenSha256 = sha256(token);
  const grants = await prisma.$queryRawUnsafe<any[]>(`
    SELECT g."id",g."tenantId",g."patientId",g."scopes",g."expiresAt",
           p."displayName",p."species",p."breed",p."sex",p."birthDate",p."guardianName",
           t."name" AS "clinicName"
    FROM public."VeterinaryGuardianPortalGrant" g
    JOIN public."CarePatient" p
      ON p."tenantId"=g."tenantId" AND p."id"=g."patientId" AND p."kind"='animal' AND p."active"=true
    JOIN public."Tenant" t ON t."id"=g."tenantId"
    WHERE g."tokenSha256"=$1
      AND g."revokedAt" IS NULL
      AND g."expiresAt">now()
    LIMIT 1
  `, tokenSha256);
  const grant = grants[0];
  if (!grant) throw new HttpError(404, 'El enlace del portal no existe, venció o fue revocado.');

  await prisma.$executeRawUnsafe(`
    UPDATE public."VeterinaryGuardianPortalGrant"
    SET "lastUsedAt"=now()
    WHERE "id"=$1 AND "revokedAt" IS NULL
  `, grant.id);

  const tenantId = String(grant.tenantId);
  const patientId = String(grant.patientId);
  const scopes = Array.isArray(grant.scopes) ? grant.scopes.map(String) : [];
  const allowed = (scope: string) => scopes.includes(scope);

  const [appointmentRows, dischargeRows, documentRows, billingRows, communicationRows] = await Promise.all([
    allowed('appointments') ? prisma.$queryRawUnsafe<any[]>(`
      SELECT "startsAt","endsAt","status","reason","channel","reminderStatus"
      FROM public."CareAppointment"
      WHERE "tenantId"=$1 AND "patientId"=$2
        AND "startsAt">=now()-interval '30 days'
      ORDER BY "startsAt" ASC
      LIMIT 40
    `, tenantId, patientId) : Promise.resolve([]),
    allowed('discharges') ? prisma.$queryRawUnsafe<any[]>(`
      SELECT "admissionNumber","admittedAt","dischargedAt","status","diagnosis","ward"
      FROM public."CareHospitalization"
      WHERE "tenantId"=$1 AND "patientId"=$2
      ORDER BY "admittedAt" DESC
      LIMIT 20
    `, tenantId, patientId) : Promise.resolve([]),
    allowed('documents') ? prisma.$queryRawUnsafe<any[]>(`
      SELECT "kind","title","status","scheduledAt","performedAt","findings","impression","externalUrl"
      FROM public."CareDiagnosticStudy"
      WHERE "tenantId"=$1 AND "patientId"=$2
      ORDER BY COALESCE("performedAt","scheduledAt","createdAt") DESC
      LIMIT 30
    `, tenantId, patientId) : Promise.resolve([]),
    allowed('billing') ? prisma.$queryRawUnsafe<any[]>(`
      SELECT f."status" AS "caseStatus",f."estimatedTotal"::text AS "estimatedTotal",f."currency",
             f."authorizedAt",f."attendedAt",f."invoicedAt",
             s."number" AS "invoiceNumber",s."status"::text AS "invoiceStatus",
             s."total"::text AS "invoiceTotal",s."issueDate"
      FROM public."VeterinaryFinancialCase" f
      LEFT JOIN public."SalesInvoice" s
        ON s."tenantId"=f."tenantId" AND s."id"=f."salesInvoiceId"
      WHERE f."tenantId"=$1 AND f."patientId"=$2
      ORDER BY f."createdAt" DESC
      LIMIT 30
    `, tenantId, patientId) : Promise.resolve([]),
    allowed('communications') ? prisma.$queryRawUnsafe<any[]>(`
      SELECT "channel","event","status","scheduledAt","sentAt","createdAt",
             NULLIF("payload"->>'guardianText','') AS "guardianText"
      FROM public."CareCommunicationLog"
      WHERE "tenantId"=$1 AND "patientId"=$2
      ORDER BY "createdAt" DESC
      LIMIT 50
    `, tenantId, patientId) : Promise.resolve([])
  ]);

  const documents = documentRows.map((row) => ({
    kind:String(row.kind || 'document'),
    title:String(row.title || 'Documento clínico'),
    status:String(row.status || ''),
    scheduledAt:row.scheduledAt || null,
    performedAt:row.performedAt || null,
    findings:row.findings ? String(row.findings) : null,
    impression:row.impression ? String(row.impression) : null,
    externalUrl:/^https:\/\//i.test(String(row.externalUrl || '')) ? String(row.externalUrl) : null
  }));

  ok(res, {
    clinic:{ name:String(grant.clinicName || 'Clínica veterinaria') },
    patient:{
      displayName:String(grant.displayName || 'Mascota'),
      species:grant.species ? String(grant.species) : null,
      breed:grant.breed ? String(grant.breed) : null,
      sex:grant.sex ? String(grant.sex) : null,
      birthDate:grant.birthDate || null,
      guardianName:grant.guardianName ? String(grant.guardianName) : null
    },
    access:{ expiresAt:grant.expiresAt, scopes },
    appointments:appointmentRows.map((row) => ({
      startsAt:row.startsAt, endsAt:row.endsAt, status:String(row.status || ''),
      reason:row.reason ? String(row.reason) : null, channel:String(row.channel || 'onsite'),
      reminderStatus:String(row.reminderStatus || 'pending')
    })),
    discharges:dischargeRows.map((row) => ({
      admissionNumber:String(row.admissionNumber || ''),
      admittedAt:row.admittedAt, dischargedAt:row.dischargedAt || null,
      status:String(row.status || ''), diagnosis:row.diagnosis ? String(row.diagnosis) : null,
      ward:row.ward ? String(row.ward) : null
    })),
    documents,
    billing:billingRows.map((row) => ({
      caseStatus:String(row.caseStatus || ''),
      estimatedTotal:String(row.estimatedTotal || '0.00'),
      currency:String(row.currency || 'VES'),
      authorizedAt:row.authorizedAt || null,
      attendedAt:row.attendedAt || null,
      invoicedAt:row.invoicedAt || null,
      invoiceNumber:row.invoiceNumber ? String(row.invoiceNumber) : null,
      invoiceStatus:row.invoiceStatus ? String(row.invoiceStatus) : null,
      invoiceTotal:row.invoiceTotal ? String(row.invoiceTotal) : null,
      issueDate:row.issueDate || null
    })),
    communications:communicationRows.map((row) => ({
      channel:String(row.channel || ''),
      event:String(row.event || ''),
      status:String(row.status || ''),
      scheduledAt:row.scheduledAt || null,
      sentAt:row.sentAt || null,
      createdAt:row.createdAt,
      guardianText:row.guardianText ? String(row.guardianText) : null
    }))
  });
}));

export default router;
