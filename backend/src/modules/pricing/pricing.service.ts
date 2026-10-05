import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { exchangeRate } from '../../shared/financial/decimal.js';
import { HttpError } from '../../shared/http.js';
import {
  materializeResolvedAmount,
  PriceResolutionError,
  selectPriceCandidate,
  type PriceCandidate,
} from './price-resolution.policy.js';

type PriceCandidateRow = {
  entryId: string;
  priceBookId: string;
  amount: Prisma.Decimal;
  currency: string;
  priceMode: 'fixed' | 'fx_derived';
  priority: number;
  locationScope: 'global' | 'specific_locations';
  effectiveFrom: Date;
  effectiveTo: Date | null;
  version: number;
  bookVersion: number;
  locationIds: string[];
};

export type ResolveCanonicalPriceInput = {
  tenantId: string;
  targetType: 'product' | 'service';
  targetId: string;
  documentCurrency: string;
  instant?: Date;
  businessLocationId?: string | null;
  fxRate?: Prisma.Decimal | string | number;
  fxRateDate?: Date;
  fxRateSource?: string;
};

function asHttpError(error: unknown): never {
  if (!(error instanceof PriceResolutionError)) throw error;
  const status = error.code === 'PRICE_AUTHORITY_NOT_FOUND' ? 409 : 422;
  throw new HttpError(status, error.message, { code: error.code });
}

export async function resolveCanonicalPrice(input: ResolveCanonicalPriceInput) {
  const tenantId = input.tenantId;
  const targetId = input.targetId;
  const instant = input.instant || new Date();
  const documentCurrency = input.documentCurrency.trim().toUpperCase();

  if (input.targetType === 'service') {
    // #849 has not established a canonical service identity table on this baseline.
    // Reject unverifiable references rather than accepting a cross-tenant opaque id.
    throw new HttpError(409, 'El catálogo de servicios todavía no expone una identidad canónica verificable para pricing.', { code: 'PRICE_SERVICE_AUTHORITY_UNAVAILABLE' });
  }

  const product = await prisma.product.findFirst({ where: { id: targetId, tenantId }, select: { id: true } });
  if (!product) throw new HttpError(404, 'Producto no encontrado en el tenant activo.', { code: 'PRICE_PRODUCT_NOT_FOUND' });

  if (input.businessLocationId) {
    const locations = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM public."BusinessLocation"
      WHERE "id"=${input.businessLocationId} AND "tenantId"=${tenantId} AND "status"='active'
      LIMIT 1
    `;
    if (!locations[0]) throw new HttpError(422, 'La sede de pricing no pertenece al tenant activo o no está disponible.', { code: 'PRICE_LOCATION_TENANT_MISMATCH' });
  }

  const rows = await prisma.$queryRaw<PriceCandidateRow[]>`
    SELECT
      e."id" AS "entryId",
      b."id" AS "priceBookId",
      e."amount",
      upper(b."currency") AS "currency",
      b."priceMode",
      b."priority",
      b."locationScope",
      e."effectiveFrom",
      e."effectiveTo",
      e."version",
      b."version" AS "bookVersion",
      COALESCE((SELECT array_agg(bl."businessLocationId" ORDER BY bl."businessLocationId") FROM public."PriceBookLocation" bl WHERE bl."priceBookId"=b."id"), ARRAY[]::text[]) AS "locationIds"
    FROM public."PriceEntry" e
    JOIN public."PriceBook" b ON b."id"=e."priceBookId" AND b."tenantId"=e."tenantId"
    WHERE e."tenantId"=${tenantId}
      AND e."targetType"=${input.targetType}
      AND e."targetId"=${targetId}
      AND e."status"='active'
      AND b."status"='active'
  `;

  const candidates: PriceCandidate[] = rows
    .filter((row) => row.priceMode === 'fx_derived' || row.currency === documentCurrency)
    .map((row) => ({
      entryId: row.entryId,
      priceBookId: row.priceBookId,
      amount: row.amount,
      currency: row.currency,
      priceMode: row.priceMode,
      priority: row.priority,
      locationScope: row.locationScope,
      locationIds: row.locationIds,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      version: row.version,
    }));

  try {
    const candidate = selectPriceCandidate(candidates, { instant, locationId: input.businessLocationId || null });
    const row = rows.find((value) => value.entryId === candidate.entryId)!;
    const materialized = materializeResolvedAmount(candidate, {
      documentCurrency,
      fxRate: input.fxRate === undefined ? undefined : exchangeRate(input.fxRate),
      fxRateDate: input.fxRateDate,
      fxRateSource: input.fxRateSource,
    });
    return {
      amount: materialized.amount,
      currency: materialized.currency,
      sourceCurrency: materialized.sourceCurrency,
      priceMode: candidate.priceMode,
      priceBookId: candidate.priceBookId,
      priceEntryId: candidate.entryId,
      priceBookVersion: row.bookVersion,
      priceEntryVersion: candidate.version,
      effectiveFrom: candidate.effectiveFrom,
      effectiveTo: candidate.effectiveTo,
      priority: candidate.priority,
      locationScope: candidate.locationScope,
      businessLocationId: input.businessLocationId || null,
      fxDerived: materialized.fxDerived,
      fxRate: materialized.fxRate,
      fxRateDate: materialized.fxRateDate,
      fxRateSource: materialized.fxRateSource,
      reason: `priority:${candidate.priority};scope:${candidate.locationScope};mode:${candidate.priceMode}`,
    };
  } catch (error) {
    asHttpError(error);
  }
}
