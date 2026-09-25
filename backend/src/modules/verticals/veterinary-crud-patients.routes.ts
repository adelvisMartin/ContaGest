import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { veterinaryPatientPatchSchema } from './veterinary.schemas.js';

const router = Router();
const ctx = (req: any) => req.context as { tenantId: string };
function changed<T extends Record<string, unknown>>(body: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(body, key);
}

router.patch('/health/patients/:id', asyncHandler(async (req, res) => {
  const b = veterinaryPatientPatchSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."CarePatient" SET
      "displayName"=CASE WHEN $3 THEN $4 ELSE "displayName" END,
      "species"=CASE WHEN $5 THEN $6 ELSE "species" END,
      "breed"=CASE WHEN $7 THEN $8 ELSE "breed" END,
      "color"=CASE WHEN $9 THEN $10 ELSE "color" END,
      "sex"=CASE WHEN $11 THEN $12 ELSE "sex" END,
      "birthDate"=CASE WHEN $13 THEN $14::date ELSE "birthDate" END,
      "microchip"=CASE WHEN $15 THEN $16 ELSE "microchip" END,
      "guardianName"=CASE WHEN $17 THEN $18 ELSE "guardianName" END,
      "guardianPhone"=CASE WHEN $19 THEN $20 ELSE "guardianPhone" END,
      "guardianEmail"=CASE WHEN $21 THEN NULLIF($22,'') ELSE "guardianEmail" END,
      "allergies"=CASE WHEN $23 THEN $24 ELSE "allergies" END,
      "conditions"=CASE WHEN $25 THEN $26 ELSE "conditions" END,
      "notes"=CASE WHEN $27 THEN $28 ELSE "notes" END,
      "active"=CASE WHEN $29 THEN $30 ELSE "active" END,
      "updatedAt"=now()
    WHERE "id"=$1 AND "tenantId"=$2 AND "kind"='animal'
    RETURNING *
  `,
  req.params.id, ctx(req).tenantId,
  changed(b,'displayName'), b.displayName ?? null,
  changed(b,'species'), b.species ?? null,
  changed(b,'breed'), b.breed ?? null,
  changed(b,'color'), b.color ?? null,
  changed(b,'sex'), b.sex ?? null,
  changed(b,'birthDate'), b.birthDate || null,
  changed(b,'microchip'), b.microchip ?? null,
  changed(b,'guardianName'), b.guardianName ?? null,
  changed(b,'guardianPhone'), b.guardianPhone ?? null,
  changed(b,'guardianEmail'), b.guardianEmail ?? null,
  changed(b,'allergies'), b.allergies ?? null,
  changed(b,'conditions'), b.conditions ?? null,
  changed(b,'notes'), b.notes ?? null,
  changed(b,'active'), b.active ?? true);
  if (!rows.length) throw new HttpError(404, 'Mascota no encontrada.');
  ok(res, rows[0]);
}));

router.delete('/health/patients/:id', asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."CarePatient" SET "active"=false,"updatedAt"=now()
    WHERE "id"=$1 AND "tenantId"=$2 AND "kind"='animal' RETURNING *
  `, req.params.id, ctx(req).tenantId);
  if (!rows.length) throw new HttpError(404, 'Mascota no encontrada.');
  ok(res, { archived:true, patient:rows[0] });
}));

export default router;
