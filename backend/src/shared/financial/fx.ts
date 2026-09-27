import { Prisma } from '@prisma/client';
import { HttpError } from '../http.js';
import {
  ONE,
  ZERO,
  add,
  exchangeRate,
  money,
  multiply,
  quantizeMoney,
  serializeDecimal,
  subtract,
  type DecimalInput,
  type DecimalValue
} from './decimal.js';

export const FX_POLICY_VERSION = 1 as const;
export const FX_ROUNDING_MODE = 'ROUND_HALF_UP' as const;
export const FX_MONEY_SCALE = 2 as const;
export const FX_EXCHANGE_RATE_SCALE = 4 as const;

export type FxDocumentType = 'sales' | 'purchase';
export type FxSourceType = FxDocumentType;

export type FxLedgerLine = {
  accountCode: string;
  accountName: string;
  debit?: DecimalInput;
  credit?: DecimalInput;
};

export type FunctionalizedLedgerLine = {
  accountCode: string;
  accountName: string;
  originalDebit: DecimalValue;
  originalCredit: DecimalValue;
  functionalDebit: DecimalValue;
  functionalCredit: DecimalValue;
};

export type FxContext = {
  policyVersion: typeof FX_POLICY_VERSION;
  originalCurrency: string;
  functionalCurrency: string;
  exchangeRate: DecimalValue;
  rateDate: Date;
  rateSource: string;
};

const CURRENCY_RE = /^[A-Z]{3}$/;

export function normalizeCurrency(value: unknown): string {
  const currency = String(value ?? '').trim().toUpperCase();
  if (!CURRENCY_RE.test(currency)) throw new HttpError(422, 'La moneda debe usar un código de tres letras (ISO-like).');
  return currency;
}

function normalizeRateSource(value: unknown, fallback: string) {
  const source = String(value ?? '').trim() || fallback;
  if (source.length > 120) throw new HttpError(422, 'La fuente de la tasa no puede exceder 120 caracteres.');
  return source;
}

function normalizeRateDate(value: unknown, fallback: Date) {
  const date = value instanceof Date ? value : value ? new Date(String(value)) : fallback;
  if (Number.isNaN(date.getTime())) throw new HttpError(422, 'Fecha de tasa cambiaria inválida.');
  return date;
}

export function resolveFxContext(input: {
  originalCurrency: unknown;
  functionalCurrency: unknown;
  exchangeRate?: DecimalInput;
  rateDate?: unknown;
  rateSource?: unknown;
  documentDate?: Date;
}): FxContext {
  const originalCurrency = normalizeCurrency(input.originalCurrency);
  const functionalCurrency = normalizeCurrency(input.functionalCurrency);
  const fallbackDate = input.documentDate || new Date();

  if (originalCurrency === functionalCurrency) {
    if (input.exchangeRate !== undefined && !exchangeRate(input.exchangeRate).eq(ONE)) {
      throw new HttpError(422, 'Un documento en moneda funcional debe usar tasa 1.0000.');
    }
    return {
      policyVersion: FX_POLICY_VERSION,
      originalCurrency,
      functionalCurrency,
      exchangeRate: ONE,
      rateDate: normalizeRateDate(input.rateDate, fallbackDate),
      rateSource: normalizeRateSource(input.rateSource, 'functional-currency')
    };
  }

  if (input.exchangeRate === undefined) throw new HttpError(422, 'La tasa de cambio es obligatoria cuando la moneda del documento difiere de la moneda funcional.');
  const rate = exchangeRate(input.exchangeRate);
  if (!rate.isPositive()) throw new HttpError(422, 'La tasa de cambio debe ser mayor que cero.');
  return {
    policyVersion: FX_POLICY_VERSION,
    originalCurrency,
    functionalCurrency,
    exchangeRate: rate,
    rateDate: normalizeRateDate(input.rateDate, fallbackDate),
    rateSource: normalizeRateSource(input.rateSource, 'manual-document')
  };
}

export function convertToFunctional(amount: DecimalInput, rate: DecimalInput): DecimalValue {
  return quantizeMoney(multiply(money(amount), exchangeRate(rate)));
}

export function convertFromFunctional(amount: DecimalInput, rate: DecimalInput): DecimalValue {
  const normalizedRate = exchangeRate(rate);
  if (!normalizedRate.isPositive()) throw new HttpError(422, 'La tasa de cambio debe ser mayor que cero.');
  return new Prisma.Decimal(money(amount)).dividedBy(normalizedRate).toDecimalPlaces(FX_MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

function totalFunctional(lines: FunctionalizedLedgerLine[], side: 'functionalDebit' | 'functionalCredit') {
  return add(...lines.map((line) => line[side]));
}

function allocateRoundingDifference(lines: FunctionalizedLedgerLine[]) {
  const debit = totalFunctional(lines, 'functionalDebit');
  const credit = totalFunctional(lines, 'functionalCredit');
  const difference = subtract(debit, credit);
  if (difference.isZero()) return { lines, roundingAdjustment: ZERO };

  const absoluteDifference = difference.abs();
  if (absoluteDifference.gt(new Prisma.Decimal('0.01'))) {
    throw new HttpError(422, `La conversión cambiaria produjo una diferencia de redondeo inesperada: ${serializeDecimal(difference, 2)}.`);
  }

  const side = difference.isPositive() ? 'functionalCredit' : 'functionalDebit';
  const candidates = lines.filter((line) => line[side].isPositive());
  if (!candidates.length) throw new HttpError(422, 'No existe una línea elegible para asignar el centavo de redondeo cambiario.');
  const target = candidates.reduce((best, line) => (line[side].gt(best[side]) ? line : best), candidates[0]);
  target[side] = money(target[side].plus(absoluteDifference));
  return { lines, roundingAdjustment: difference };
}

export function functionalizeBalancedLedgerLines(lines: FxLedgerLine[], rate: DecimalInput) {
  const normalizedRate = exchangeRate(rate);
  const functionalized: FunctionalizedLedgerLine[] = lines.map((line) => {
    const originalDebit = money(line.debit ?? ZERO);
    const originalCredit = money(line.credit ?? ZERO);
    return {
      accountCode: line.accountCode,
      accountName: line.accountName,
      originalDebit,
      originalCredit,
      functionalDebit: convertToFunctional(originalDebit, normalizedRate),
      functionalCredit: convertToFunctional(originalCredit, normalizedRate)
    };
  });

  const originalDebit = add(...functionalized.map((line) => line.originalDebit));
  const originalCredit = add(...functionalized.map((line) => line.originalCredit));
  if (!subtract(originalDebit, originalCredit).isZero()) throw new HttpError(422, 'El asiento original debe estar balanceado antes de convertirlo a moneda funcional.');

  const allocated = allocateRoundingDifference(functionalized);
  const functionalDebit = totalFunctional(allocated.lines, 'functionalDebit');
  const functionalCredit = totalFunctional(allocated.lines, 'functionalCredit');
  if (!subtract(functionalDebit, functionalCredit).isZero()) throw new HttpError(422, 'El asiento funcional quedó descuadrado después de aplicar la política de redondeo.');

  return {
    lines: allocated.lines,
    originalDebit,
    originalCredit,
    functionalDebit,
    functionalCredit,
    roundingAdjustment: allocated.roundingAdjustment
  };
}

export function fxDifferenceForAsset(input: { originalAmount: DecimalInput; historicalRate: DecimalInput; currentRate: DecimalInput }) {
  const historicalFunctionalAmount = convertToFunctional(input.originalAmount, input.historicalRate);
  const currentFunctionalAmount = convertToFunctional(input.originalAmount, input.currentRate);
  return {
    historicalFunctionalAmount,
    currentFunctionalAmount,
    difference: money(currentFunctionalAmount.minus(historicalFunctionalAmount))
  };
}

export function fxDifferenceForLiability(input: { originalAmount: DecimalInput; historicalRate: DecimalInput; currentRate: DecimalInput }) {
  const base = fxDifferenceForAsset(input);
  return { ...base, difference: money(base.difference.negated()) };
}
