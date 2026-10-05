import { Prisma } from '@prisma/client';
import { divide, money, quantizeMoney } from '../../shared/financial/decimal.js';

export type PriceMode = 'fixed' | 'fx_derived';
export type PriceLocationScope = 'global' | 'specific_locations';

export type PriceCandidate = {
  entryId: string;
  priceBookId: string;
  amount: Prisma.Decimal;
  currency: string;
  priceMode: PriceMode;
  priority: number;
  locationScope: PriceLocationScope;
  locationIds?: readonly string[];
  effectiveFrom: Date;
  effectiveTo: Date | null;
  version: number;
};

export type PriceResolutionErrorCode =
  | 'PRICE_AUTHORITY_NOT_FOUND'
  | 'PRICE_AUTHORITY_AMBIGUOUS'
  | 'PRICE_CURRENCY_MISMATCH'
  | 'PRICE_FX_EVIDENCE_REQUIRED'
  | 'PRICE_FX_RATE_INVALID';

export class PriceResolutionError extends Error {
  constructor(public readonly code: PriceResolutionErrorCode, message: string) {
    super(message);
    this.name = 'PriceResolutionError';
  }
}

function isEffective(candidate: PriceCandidate, instant: Date) {
  const at = instant.getTime();
  return candidate.effectiveFrom.getTime() <= at && (candidate.effectiveTo === null || at < candidate.effectiveTo.getTime());
}

function isLocationEligible(candidate: PriceCandidate, locationId: string | null) {
  if (candidate.locationScope === 'global') return true;
  if (!locationId) return false;
  return (candidate.locationIds || []).includes(locationId);
}

export function selectPriceCandidate(
  candidates: readonly PriceCandidate[],
  context: { instant: Date; locationId: string | null },
): PriceCandidate {
  const eligible = candidates
    .filter((candidate) => isEffective(candidate, context.instant) && isLocationEligible(candidate, context.locationId))
    .sort((left, right) => right.priority - left.priority);

  if (!eligible.length) {
    throw new PriceResolutionError('PRICE_AUTHORITY_NOT_FOUND', 'No existe un precio comercial efectivo para el contexto solicitado.');
  }

  const highestPriority = eligible[0].priority;
  const winners = eligible.filter((candidate) => candidate.priority === highestPriority);
  if (winners.length !== 1) {
    throw new PriceResolutionError('PRICE_AUTHORITY_AMBIGUOUS', 'Existen múltiples precios con la misma precedencia efectiva. Corrige la configuración antes de continuar.');
  }
  return winners[0];
}

export function materializeResolvedAmount(
  candidate: PriceCandidate,
  context: {
    documentCurrency: string;
    fxRate?: Prisma.Decimal;
    fxRateDate?: Date;
    fxRateSource?: string;
  },
) {
  const documentCurrency = context.documentCurrency.trim().toUpperCase();
  const sourceCurrency = candidate.currency.trim().toUpperCase();

  if (candidate.priceMode === 'fixed') {
    if (sourceCurrency !== documentCurrency) {
      throw new PriceResolutionError('PRICE_CURRENCY_MISMATCH', `El precio está fijado en ${sourceCurrency}; el documento requiere ${documentCurrency}.`);
    }
    return {
      amount: money(candidate.amount),
      currency: documentCurrency,
      sourceCurrency,
      fxDerived: false as const,
      fxRate: null,
      fxRateDate: null,
      fxRateSource: null,
    };
  }

  if (sourceCurrency === documentCurrency) {
    return {
      amount: money(candidate.amount),
      currency: documentCurrency,
      sourceCurrency,
      fxDerived: false as const,
      fxRate: null,
      fxRateDate: null,
      fxRateSource: null,
    };
  }

  if (!context.fxRate || !context.fxRateDate || !context.fxRateSource?.trim()) {
    throw new PriceResolutionError('PRICE_FX_EVIDENCE_REQUIRED', 'Un precio derivado por FX requiere tasa, fecha y fuente provenientes de la autoridad financiera.');
  }
  if (!context.fxRate.isPositive()) {
    throw new PriceResolutionError('PRICE_FX_RATE_INVALID', 'La tasa FX para materializar el precio debe ser mayor que cero.');
  }

  // ContaGest document exchangeRate uses document->functional/reference convention.
  // Pricing only consumes that externally supplied evidence; it never discovers or owns FX.
  const amount = quantizeMoney(divide(candidate.amount, context.fxRate));
  return {
    amount,
    currency: documentCurrency,
    sourceCurrency,
    fxDerived: true as const,
    fxRate: context.fxRate,
    fxRateDate: context.fxRateDate,
    fxRateSource: context.fxRateSource.trim(),
  };
}
