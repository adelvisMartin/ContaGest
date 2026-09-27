import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';

type Db = Prisma.TransactionClient | typeof prisma;

export type FiscalRuleVersion = {
  id: string;
  tenantId: string;
  code: string;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  source: string;
  documentation: string;
  payload: Prisma.JsonValue;
  contentHash: string;
};

export async function resolveFiscalRule(
  input: { tenantId: string; code: string; at: Date },
  db: Db = prisma,
) {
  const rows = await db.$queryRaw<FiscalRuleVersion[]>(Prisma.sql`
    SELECT * FROM "FiscalRuleVersion"
    WHERE "tenantId" = ${input.tenantId}::uuid
      AND "code" = ${input.code}
      AND "effectiveFrom" <= ${input.at}
      AND ("effectiveTo" IS NULL OR "effectiveTo" > ${input.at})
    ORDER BY "effectiveFrom" DESC, "version" DESC
    LIMIT 2
  `);

  if (rows.length === 0) {
    throw new HttpError(422, `No existe regla fiscal ${input.code} vigente para la fecha indicada.`);
  }
  if (rows.length > 1) {
    throw new HttpError(409, `La regla fiscal ${input.code} tiene vigencias superpuestas; corrige el catálogo antes de emitir.`);
  }
  return rows[0]!;
}

export async function allocateFiscalNumber(
  input: { tenantId: string; documentType: string; series?: string; idempotencyKey: string },
  db: Db = prisma,
) {
  const key = input.idempotencyKey.trim();
  if (!key) {
    throw new HttpError(400, 'Idempotency-Key es obligatorio para reservar numeración fiscal.');
  }

  const rows = await db.$queryRaw<
    Array<{ reservationId: string; sequenceValue: bigint; allocatedNumber: string }>
  >(Prisma.sql`
    SELECT * FROM allocate_fiscal_number(
      ${input.tenantId}::uuid,
      ${input.documentType},
      ${input.series || 'DEFAULT'},
      ${key}
    )
  `);

  if (!rows[0]) {
    throw new HttpError(500, 'No fue posible reservar la numeración fiscal.');
  }
  return rows[0];
}

export async function snapshotAppliedFiscalRule(
  input: { tenantId: string; documentType: string; documentId: string; rule: FiscalRuleVersion },
  db: Db = prisma,
) {
  const inserted = await db.$queryRaw<Array<{ ruleId: string; ruleHash: string }>>(Prisma.sql`
    INSERT INTO "FiscalDocumentRuleSnapshot"(
      "tenantId", "documentType", "documentId", "ruleCode", "ruleVersion", "ruleId", "ruleHash", "rulePayload"
    ) VALUES (
      ${input.tenantId}::uuid,
      ${input.documentType},
      ${input.documentId}::uuid,
      ${input.rule.code},
      ${input.rule.version},
      ${input.rule.id}::uuid,
      ${input.rule.contentHash},
      ${JSON.stringify(input.rule.payload)}::jsonb
    )
    ON CONFLICT ("tenantId", "documentType", "documentId", "ruleCode") DO NOTHING
    RETURNING "ruleId", "ruleHash"
  `);

  if (inserted.length === 1) return;

  const existing = await db.$queryRaw<Array<{ ruleId: string; ruleHash: string }>>(Prisma.sql`
    SELECT "ruleId", "ruleHash"
    FROM "FiscalDocumentRuleSnapshot"
    WHERE "tenantId" = ${input.tenantId}::uuid
      AND "documentType" = ${input.documentType}
      AND "documentId" = ${input.documentId}::uuid
      AND "ruleCode" = ${input.rule.code}
  `);

  if (existing[0]?.ruleId !== input.rule.id || existing[0]?.ruleHash !== input.rule.contentHash) {
    throw new HttpError(409, 'El documento ya conserva una versión fiscal diferente y no puede reinterpretarse.');
  }
}

export async function bindFiscalNumber(
  input: { tenantId: string; reservationId: string; documentId: string },
  db: Db = prisma,
) {
  const updated = await db.$executeRaw(Prisma.sql`
    UPDATE "FiscalNumberReservation"
    SET "status" = 'bound', "documentId" = ${input.documentId}::uuid
    WHERE "id" = ${input.reservationId}::uuid
      AND "tenantId" = ${input.tenantId}::uuid
      AND (
        "status" = 'allocated'
        OR ("status" = 'bound' AND "documentId" = ${input.documentId}::uuid)
      )
  `);

  if (updated !== 1) {
    throw new HttpError(409, 'La reserva fiscal no existe, ya pertenece a otro documento o corresponde a otro tenant.');
  }
}

export async function cancelFiscalNumber(
  input: { tenantId: string; reservationId: string },
  db: Db = prisma,
) {
  const updated = await db.$executeRaw(Prisma.sql`
    UPDATE "FiscalNumberReservation"
    SET "status" = 'cancelled', "cancelledAt" = COALESCE("cancelledAt", NOW())
    WHERE "id" = ${input.reservationId}::uuid
      AND "tenantId" = ${input.tenantId}::uuid
      AND "status" IN ('allocated', 'bound', 'cancelled')
  `);

  if (updated !== 1) {
    throw new HttpError(409, 'La reserva fiscal no puede anularse.');
  }
}
