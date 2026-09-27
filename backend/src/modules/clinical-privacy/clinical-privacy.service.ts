import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';

export const CLINICAL_SIGNED_URL_TTL_SECONDS = 3_600;

export function hasPotentialClinicalContent(input: unknown) {
  const text = JSON.stringify(input ?? '').toLowerCase();
  if (!text || text === '""') return false;
  return /(clinicaldata|clinical[_ -]?data|historia clínica|historial clínico|paciente|patient|odontograma|diagn[oó]stic|prescrip|medicaci[oó]n|alergia|assessment|psycholog|psicolog|veterinar|medicalnotes|medical_notes|treatment plan|plan de tratamiento)/i.test(text);
}

export function externalOperationalAiApproved(source: NodeJS.ProcessEnv = process.env) {
  return String(source.OPENAI_OPERATIONAL_EXTERNAL_APPROVED || '').toLowerCase() === 'true';
}

export function assertExternalClinicalTransferAllowed(input: {
  provider: string;
  purpose: string;
  payload: unknown;
  source?: NodeJS.ProcessEnv;
}) {
  if (hasPotentialClinicalContent(input.payload)) {
    throw new HttpError(403, 'Los datos clínicos no están autorizados para transferencia al proveedor externo.', {
      code: 'CLINICAL_EXTERNAL_TRANSFER_BLOCKED',
      provider: input.provider,
      purpose: input.purpose,
    });
  }
  if (!externalOperationalAiApproved(input.source)) {
    throw new HttpError(403, 'El proveedor externo no está aprobado para este flujo operativo.', {
      code: 'EXTERNAL_PROVIDER_REVIEW_REQUIRED',
      provider: input.provider,
      purpose: input.purpose,
    });
  }
}

export async function buildClinicalExport(tenantId: string, patientId: string) {
  const patients = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT "id","kind","firstName","lastName","displayName","idNumber","birthDate","sex","phone","email","address",
           "emergencyContact","allergies","conditions","notes","createdAt","updatedAt"
    FROM public."CarePatient"
    WHERE "tenantId" = ${tenantId} AND "id" = ${patientId} AND "active" = true
    LIMIT 1
  `);
  const patient = patients[0];
  if (!patient) throw new HttpError(404, 'Paciente clínico no encontrado en la empresa activa.');

  const encounters = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT "id","professionalId","appointmentId","specialty","type","subjective","objective","assessment","plan",
           "diagnosisCodes","clinicalData","confidential","status","signedAt","createdAt","updatedAt"
    FROM public."CareEncounter"
    WHERE "tenantId" = ${tenantId} AND "patientId" = ${patientId}
    ORDER BY "createdAt" ASC, "id" ASC
    LIMIT 5000
  `);

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    patient,
    encounters,
  };
}

export async function assertClinicalStorageAccess(input: {
  tenantId: string;
  bucket: string;
  objectKey: string;
  patientId?: string | null;
}) {
  if (!input.objectKey.startsWith(`${input.tenantId}/`)) {
    throw new HttpError(403, 'El adjunto clínico no pertenece a la empresa activa.', { code: 'CLINICAL_MEDIA_TENANT_MISMATCH' });
  }
  const rows = await prisma.$queryRaw<Array<{ id: string; subjectId: string | null }>>(Prisma.sql`
    SELECT "id","subjectId"
    FROM public."DataStorageObject"
    WHERE "tenantId" = ${input.tenantId}::uuid
      AND "bucket" = ${input.bucket}
      AND "objectKey" = ${input.objectKey}
      AND "lifecycleEntityType" = 'ClinicalMediaObject'
      AND "status" = 'active'
      AND (${input.patientId || null}::text IS NULL OR "subjectId" = ${input.patientId || null})
    LIMIT 1
  `);
  if (!rows[0]) throw new HttpError(404, 'Adjunto clínico no disponible para el tenant/paciente activo.', { code: 'CLINICAL_MEDIA_NOT_AUTHORIZED' });
  return rows[0];
}
