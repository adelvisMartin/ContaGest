import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx as context, one, optionalText } from './verticals.shared.js';

const router = Router();

const prescriptionSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  medication: z.string().trim().min(2).max(240),
  dose: optionalText,
  frequency: optionalText,
  duration: optionalText,
  instructions: optionalText,
  status: z.enum(['active', 'completed', 'cancelled']).default('active')
});

const consentSchema = z.object({
  patientId: z.string().min(10),
  kind: z.string().trim().min(2).max(160),
  status: z.enum(['pending', 'signed', 'revoked', 'expired']).default('pending'),
  signerName: optionalText,
  signedAt: z.string().optional().nullable(),
  documentUrl: optionalText,
  metadata: z.record(z.string(), z.unknown()).default({})
});

router.get('/health/prescriptions', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  if (!patientId) throw new HttpError(422, 'patientId es obligatorio.');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT p.*, pr."fullName" AS "professionalName"
    FROM public."CarePrescription" p
    LEFT JOIN public."CareProfessional" pr ON pr."id" = p."professionalId"
    WHERE p."tenantId" = $1 AND p."patientId" = $2
    ORDER BY p."createdAt" DESC
    LIMIT 500
  `, context(req).tenantId, patientId);
  ok(res, rows);
}));

router.post('/health/prescriptions', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const body = prescriptionSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CarePrescription"
      ("id", "tenantId", "patientId", "encounterId", "professionalId", "medication", "dose", "frequency", "duration", "instructions", "status", "createdAt")
    VALUES
      (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
    RETURNING *
  `,
    context(req).tenantId,
    body.patientId,
    body.encounterId || null,
    body.professionalId || null,
    body.medication,
    body.dose || null,
    body.frequency || null,
    body.duration || null,
    body.instructions || null,
    body.status
  );
  ok(res, one(rows), 201);
}));

router.get('/health/consents', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  if (!patientId) throw new HttpError(422, 'patientId es obligatorio.');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."CareConsent"
    WHERE "tenantId" = $1 AND "patientId" = $2
    ORDER BY "createdAt" DESC
    LIMIT 500
  `, context(req).tenantId, patientId);
  ok(res, rows);
}));

router.post('/health/consents', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const body = consentSchema.parse(req.body || {});
  const signedAt = body.status === 'signed' ? body.signedAt || new Date().toISOString() : body.signedAt || null;
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareConsent"
      ("id", "tenantId", "patientId", "kind", "status", "signerName", "signedAt", "documentUrl", "metadata", "createdAt")
    VALUES
      (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6::timestamptz, $7, $8::jsonb, now())
    RETURNING *
  `,
    context(req).tenantId,
    body.patientId,
    body.kind,
    body.status,
    body.signerName || null,
    signedAt,
    body.documentUrl || null,
    JSON.stringify(body.metadata)
  );
  ok(res, one(rows), 201);
}));

export default router;
